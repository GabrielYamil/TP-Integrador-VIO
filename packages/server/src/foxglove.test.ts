import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import wsProtocol from '@foxglove/ws-protocol';
import type { Channel, MessageData } from '@foxglove/ws-protocol';
import type { ClientMessage, MarkerMap, Pose } from '@vio/shared';
import { compose, worldFromOdomInitial } from '@vio/shared';
import { FOXGLOVE_TOPICS, FoxgloveGateway } from './foxglove';
import { createLogger } from './logging';
import { msToNs, msToTime } from './time';

const logger = createLogger('foxglove-test', 'silent');

const markerMap: MarkerMap = {
  frame_id: 'world',
  dictionary: 'APRILTAG_36h11',
  markers: [
    {
      id: 3,
      size_m: 0.16,
      position: [1.0, 2.0, 1.2],
      orientation_xyzw: [0, 0, 0, 1],
    },
  ],
};

interface ReceivedMessage {
  topic: string;
  timestamp: bigint;
  data: any;
}

interface TestHarness {
  gateway: FoxgloveGateway;
  client: InstanceType<typeof wsProtocol.FoxgloveClient>;
  socket: WebSocket;
  channels: Channel[];
  received: ReceivedMessage[];
  close(): Promise<void>;
}

async function openHarness(): Promise<TestHarness> {
  const gateway = new FoxgloveGateway({
    markerMap,
    logger,
    host: '127.0.0.1',
    port: 0,
    snapshotIntervalMs: 0,
    sceneIntervalMs: 0,
    trajectoryMinDistanceM: 0,
  });
  await gateway.listen();

  const socket = new WebSocket(`ws://127.0.0.1:${gateway.port}`, [
    wsProtocol.FoxgloveClient.SUPPORTED_SUBPROTOCOL,
  ]);
  const client = new wsProtocol.FoxgloveClient({ ws: socket });
  const received: ReceivedMessage[] = [];
  const topicBySubscription = new Map<number, string>();

  const channels = await new Promise<Channel[]>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout esperando advertise')), 2000);
    client.on('advertise', (advertised) => {
      clearTimeout(timer);
      for (const channel of advertised) {
        const subscriptionId = client.subscribe(channel.id);
        topicBySubscription.set(subscriptionId, channel.topic);
      }
      resolve(advertised);
    });
    client.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  client.on('message', (message: MessageData) => {
    const topic = topicBySubscription.get(message.subscriptionId) ?? 'desconocido';
    received.push({
      topic,
      timestamp: message.timestamp,
      data: JSON.parse(decodePayload(message.data)),
    });
  });

  await waitFor(
    () => Object.values(FOXGLOVE_TOPICS).every((topic) => gateway.isSubscribed(topic)),
    2000,
    'suscripciones Foxglove',
  );

  return {
    gateway,
    client,
    socket,
    channels,
    received,
    async close() {
      client.close();
      await gateway.close();
    },
  };
}

let harness: TestHarness | undefined;

afterEach(async () => {
  if (harness) {
    await harness.close();
    harness = undefined;
  }
});

describe('time conversion', () => {
  it('converts milliseconds to nanoseconds and Foxglove Time', () => {
    expect(msToNs(0)).toBe(0n);
    expect(msToNs(1.5)).toBe(1_500_000n);
    expect(msToNs(1_700_000_000_123)).toBe(1_700_000_000_123_000_000n);
    expect(msToTime(0)).toEqual({ sec: 0, nsec: 0 });
    expect(msToTime(1_234.567)).toEqual({ sec: 1, nsec: 234_567_000 });
    expect(msToTime(1_700_000_000_123)).toEqual({
      sec: 1_700_000_000,
      nsec: 123_000_000,
    });
  });

  it('rejects invalid timestamps', () => {
    expect(() => msToNs(Number.NaN)).toThrow(/inválido/);
    expect(() => msToNs(-1)).toThrow(/inválido/);
    expect(() => msToTime(Number.POSITIVE_INFINITY)).toThrow(/inválido/);
  });
});

describe('FoxgloveGateway', () => {
  it('advertises JSON channels with schemas', async () => {
    harness = await openHarness();
    const topics = harness.channels.map((channel) => channel.topic).sort();
    expect(topics).toEqual(Object.values(FOXGLOVE_TOPICS).sort());
    for (const channel of harness.channels) {
      expect(channel.encoding).toBe('json');
      expect(channel.schemaEncoding).toBe('jsonschema');
      expect(() => JSON.parse(channel.schema)).not.toThrow();
    }
    expect(
      harness.channels.find((channel) => channel.topic === FOXGLOVE_TOPICS.poseRaw)?.schemaName,
    ).toBe('foxglove.PoseInFrame');
    expect(
      harness.channels.find((channel) => channel.topic === FOXGLOVE_TOPICS.metrics)?.schemaName,
    ).toBe('vio.Metrics');
  });

  it('publishes poses, transforms, scene, and metrics', async () => {
    harness = await openHarness();
    const { gateway, received } = harness;

    const rawA: Pose = { p: [0, 0, 0], q: [0, 0, 0, 1] };
    const correctedA: Pose = { p: [1, 2, 3], q: [0, 0, 0, 1] };
    const arrivalA = 1_700_000_000_000;
    const poseA: ClientMessage = {
      type: 'pose',
      t: 1000,
      raw: rawA,
      corrected: correctedA,
      tracking: 'tracking',
    };

    const rawB: Pose = { p: [1, 0, 0], q: [0, 0, 0, 1] };
    const correctedB: Pose = { p: [2, 2, 3], q: [0, 0, 0, 1] };
    const arrivalB = arrivalA + 33;
    const poseB: ClientMessage = {
      type: 'pose',
      t: 1033,
      raw: rawB,
      corrected: correctedB,
      tracking: 'tracking',
    };

    const markerMessage: ClientMessage = {
      type: 'marker',
      t: 1020,
      id: 3,
      T_cam_marker: { p: [0.1, 0.2, 0.9], q: [0, 0, 0, 1] },
      reproj_err_px: 0.8,
    };
    const correctionMessage: ClientMessage = {
      type: 'correction',
      t: 1025,
      id: 3,
      delta_p_m: 0.02,
      delta_angle_rad: 0.01,
    };

    const rawC: Pose = { p: [0.5, 0.25, 1.4], q: [0, 0, 0, 1] };
    const arrivalC = arrivalB + 33;
    const poseC: ClientMessage = {
      type: 'pose',
      t: 1100,
      raw: rawC,
      tracking: 'limited',
    };

    gateway.handleClientMessage(poseA, {
      clientId: 7,
      device: 'test-device',
      receivedAtMs: arrivalA,
    });
    gateway.handleClientMessage(poseB, {
      clientId: 7,
      device: 'test-device',
      receivedAtMs: arrivalB,
    });
    gateway.handleClientMessage(markerMessage, {
      clientId: 7,
      device: 'test-device',
      receivedAtMs: arrivalB + 10,
    });
    gateway.handleClientMessage(correctionMessage, {
      clientId: 7,
      device: 'test-device',
      receivedAtMs: arrivalB + 15,
    });
    gateway.handleClientMessage(poseC, {
      clientId: 7,
      device: 'test-device',
      receivedAtMs: arrivalC,
    });

    await waitFor(
      () =>
        received.some(
          (message) =>
            message.topic === FOXGLOVE_TOPICS.metrics && message.data.client_t_ms === poseC.t,
        ),
      2000,
      'métricas de la tercera pose',
    );

    const rawMessages = received.filter((message) => message.topic === FOXGLOVE_TOPICS.poseRaw);
    const correctedMessages = received.filter(
      (message) => message.topic === FOXGLOVE_TOPICS.poseCorrected,
    );
    const tfMessages = received.filter((message) => message.topic === FOXGLOVE_TOPICS.tf);
    const sceneMessages = received.filter((message) => message.topic === FOXGLOVE_TOPICS.markers);
    const metricsMessages = received.filter((message) => message.topic === FOXGLOVE_TOPICS.metrics);

    expect(rawMessages).toHaveLength(3);
    expect(correctedMessages).toHaveLength(3);
    expect(rawMessages[0]!.data.frame_id).toBe('odom');
    expect(rawMessages[0]!.data.pose.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(correctedMessages[0]!.data.frame_id).toBe('world');
    expect(correctedMessages[0]!.data.pose.position).toEqual({ x: 1, y: 2, z: 3 });

    const dynamicTf = tfMessages
      .flatMap((message) => message.data.transforms as any[])
      .find(
        (transform) => transform.parent_frame_id === 'world' && transform.child_frame_id === 'odom',
      );
    expect(dynamicTf).toBeDefined();
    expect(dynamicTf.translation).toEqual({ x: 1, y: 2, z: 3 });

    const markerTf = tfMessages
      .flatMap((message) => message.data.transforms as any[])
      .find(
        (transform) =>
          transform.parent_frame_id === 'world' && transform.child_frame_id === 'marker_3',
      );
    expect(markerTf).toBeDefined();
    expect(markerTf.translation).toEqual({ x: 1, y: 2, z: 1.2 });

    const lastScene = sceneMessages.at(-1)!;
    const entityIds = (lastScene.data.entities as any[]).map((entity) => entity.id);
    expect(entityIds).toContain('marker_3');
    expect(entityIds).toContain('trajectory_raw');
    expect(entityIds).toContain('trajectory_corrected');

    const rawTrajectory = (lastScene.data.entities as any[]).find(
      (entity) => entity.id === 'trajectory_raw',
    );
    const correctedTrajectory = (lastScene.data.entities as any[]).find(
      (entity) => entity.id === 'trajectory_corrected',
    );
    expect(rawTrajectory.frame_id).toBe('odom');
    expect(rawTrajectory.lines[0].points).toHaveLength(3);
    expect(correctedTrajectory.frame_id).toBe('world');
    expect(correctedTrajectory.lines[0].points).toHaveLength(3);

    const lastMetrics = metricsMessages.at(-1)!;
    expect(lastMetrics.data.tracking).toBe('limited');
    expect(lastMetrics.data.visible_markers).toEqual([3]);
    expect(lastMetrics.data.last_correction).toMatchObject({
      id: 3,
      delta_p_m: 0.02,
      delta_angle_rad: 0.01,
    });
    expect(lastMetrics.data.fps).toBeGreaterThan(0);
    expect(lastMetrics.data.processing_latency_ms).toBeGreaterThanOrEqual(0);

    const expectedCorrectedC = compose(worldFromOdomInitial(), rawC);
    const lastCorrectedC = correctedMessages.at(-1)!;
    expect(lastCorrectedC.data.frame_id).toBe('world');
    expect(lastCorrectedC.data.pose.position.x).toBeCloseTo(expectedCorrectedC.p[0], 9);
    expect(lastCorrectedC.data.pose.position.y).toBeCloseTo(expectedCorrectedC.p[1], 9);
    expect(lastCorrectedC.data.pose.position.z).toBeCloseTo(expectedCorrectedC.p[2], 9);

    const initialTf = [...tfMessages]
      .reverse()
      .flatMap((message) => message.data.transforms as any[])
      .find(
        (transform) => transform.parent_frame_id === 'world' && transform.child_frame_id === 'odom',
      );
    expect(initialTf.translation).toEqual({ x: 0, y: 0, z: 0 });
    expect(initialTf.rotation.x).toBeCloseTo(worldFromOdomInitial().q[0], 9);

    expect(gateway.getStats().subscribed_topics.sort()).toEqual(
      Object.values(FOXGLOVE_TOPICS).sort(),
    );
    expect(gateway.getStats().clients).toBe(1);
  });
});

/**
 * `MessageData.data` es un `DataView` sobre el frame binario completo. Hay que
 * respetar `byteOffset` y `byteLength`; `Buffer.from(dataView)` devuelve vacío.
 */
function decodePayload(data: ArrayBufferView): string {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
  description: string,
): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timeout esperando ${description}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
