/**
 * Puente entre la telemetría del cliente y Foxglove Studio (Fase 2).
 *
 * Canales publicados (todos con encoding JSON y JSON Schema):
 *   /tf             foxglove.FrameTransforms
 *   /pose/raw       foxglove.PoseInFrame   (odom)
 *   /pose/corrected foxglove.PoseInFrame   (world)
 *   /markers        foxglove.SceneUpdate   (marcadores y trayectorias)
 *   /metrics        vio.Metrics            (FPS, latencia, corrección)
 *
 * El timestamp de Foxglove es el de recepción en el servidor, en milisegundos
 * de época. El timestamp del celular queda en `client_t_ms` dentro de /metrics.
 */
import { Buffer } from 'node:buffer';
import { WebSocketServer } from 'ws';
import wsProtocol from '@foxglove/ws-protocol';
import type {
  ChannelId,
  FoxgloveServer as FoxgloveServerType,
  IWebSocket,
} from '@foxglove/ws-protocol';
import type {
  Color,
  CubePrimitive,
  FrameTransform,
  FrameTransforms,
  LinePrimitive,
  LineType,
  Point3,
  Pose as FoxglovePose,
  PoseInFrame,
  SceneEntity,
  SceneUpdate,
  TextPrimitive,
  Time,
} from '@foxglove/schemas';
import * as foxgloveJsonSchemas from '@foxglove/schemas/jsonschema';
import type {
  ClientMessage,
  MarkerDefinition,
  MarkerMap,
  Pose,
  TrackingState,
  Vec3,
} from '@vio/shared';
import {
  apply,
  compose,
  inverse,
  markerPose,
  quatNormalize,
  vDistance,
  worldFromOdomInitial,
} from '@vio/shared';
import type { Logger } from './logging';
import { msToNs, msToTime } from './time';

export const FOXGLOVE_TOPICS = {
  tf: '/tf',
  poseRaw: '/pose/raw',
  poseCorrected: '/pose/corrected',
  markers: '/markers',
  metrics: '/metrics',
} as const;

export interface FoxgloveMessageContext {
  clientId: number;
  device: string;
  /** Timestamp de recepción del servidor, en milisegundos de época. */
  receivedAtMs: number;
}

export interface LastCorrectionMetrics {
  id: number;
  delta_p_m: number;
  delta_angle_rad: number;
  client_t_ms: number;
  server_t_ms: number;
}

export interface MetricsMessage {
  client_id: number;
  device: string;
  client_t_ms: number;
  server_t_ms: number;
  /** Tiempo que tardó el servidor en procesar y publicar este mensaje. */
  processing_latency_ms: number;
  fps: number;
  tracking: TrackingState;
  visible_markers: number[];
  last_correction: LastCorrectionMetrics | null;
  world_odom_position: Vec3;
}

export interface FoxgloveGatewayOptions {
  markerMap: MarkerMap;
  logger: Logger;
  host?: string;
  port?: number;
  /** 0 desactiva el envío periódico de TF y escena. */
  snapshotIntervalMs?: number;
  /** 0 publica la escena en cada pose. */
  sceneIntervalMs?: number;
  trajectoryMaxPoints?: number;
  trajectoryMinDistanceM?: number;
  markerVisibilityWindowMs?: number;
}

export interface FoxgloveStats {
  host: string;
  port: number;
  clients: number;
  subscribed_topics: string[];
}

const DEFAULTS = {
  host: '0.0.0.0',
  port: 8765,
  snapshotIntervalMs: 1000,
  sceneIntervalMs: 250,
  trajectoryMaxPoints: 3000,
  trajectoryMinDistanceM: 0.01,
  markerVisibilityWindowMs: 1500,
};

const MARKER_CUBE_COLOR: Color = { r: 0.16, g: 0.48, b: 1, a: 0.65 };
const LABEL_COLOR: Color = { r: 1, g: 1, b: 1, a: 1 };
const RAW_TRAJECTORY_COLOR: Color = { r: 0.95, g: 0.25, b: 0.2, a: 1 };
const CORRECTED_TRAJECTORY_COLOR: Color = { r: 0.2, g: 0.9, b: 0.4, a: 1 };

const METRICS_SCHEMA = {
  title: 'vio.Metrics',
  description: 'Métricas del relay VIO: estado, FPS, latencia y corrección.',
  type: 'object',
  properties: {
    client_id: { type: 'integer', description: 'ID interno del cliente WebSocket.' },
    device: { type: 'string', description: 'Nombre reportado en el mensaje hello.' },
    client_t_ms: { type: 'number', description: 'Timestamp del celular, en ms.' },
    server_t_ms: { type: 'number', description: 'Timestamp de recepción, en ms de época.' },
    processing_latency_ms: { type: 'number', description: 'Tiempo de proceso en el servidor.' },
    fps: { type: 'number', description: 'Tasa estimada de mensajes pose.' },
    tracking: { type: 'string', enum: ['tracking', 'limited', 'lost'] },
    visible_markers: { type: 'array', items: { type: 'integer' } },
    last_correction: {
      type: ['object', 'null'],
      properties: {
        id: { type: 'integer' },
        delta_p_m: { type: 'number' },
        delta_angle_rad: { type: 'number' },
        client_t_ms: { type: 'number' },
        server_t_ms: { type: 'number' },
      },
      required: ['id', 'delta_p_m', 'delta_angle_rad', 'client_t_ms', 'server_t_ms'],
    },
    world_odom_position: {
      type: 'array',
      items: { type: 'number' },
      minItems: 3,
      maxItems: 3,
    },
  },
  required: [
    'client_id',
    'device',
    'client_t_ms',
    'server_t_ms',
    'processing_latency_ms',
    'fps',
    'tracking',
    'visible_markers',
    'last_correction',
    'world_odom_position',
  ],
};

interface LastPoseState {
  raw: Pose;
  corrected: Pose;
  T_world_odom: Pose;
}

export class FoxgloveGateway {
  readonly #markerMap: MarkerMap;
  readonly #logger: Logger;
  readonly #host: string;
  readonly #options: Required<
    Pick<
      FoxgloveGatewayOptions,
      | 'snapshotIntervalMs'
      | 'sceneIntervalMs'
      | 'trajectoryMaxPoints'
      | 'trajectoryMinDistanceM'
      | 'markerVisibilityWindowMs'
    >
  >;
  readonly #foxglove: FoxgloveServerType;
  readonly #channels: {
    tf: ChannelId;
    poseRaw: ChannelId;
    poseCorrected: ChannelId;
    markers: ChannelId;
    metrics: ChannelId;
  };
  readonly #channelByTopic = new Map<ChannelId, string>();
  readonly #subscribed = new Set<ChannelId>();

  #wss: WebSocketServer | null = null;
  #port: number;
  #closed = false;
  #snapshotTimer: NodeJS.Timeout | null = null;

  #lastPoses: LastPoseState | null = null;
  #lastRaw: PoseInFrame | null = null;
  #lastCorrected: PoseInFrame | null = null;
  #lastRawAtMs: number | null = null;
  #lastCorrectedAtMs: number | null = null;
  #lastMetrics: MetricsMessage | null = null;
  #lastMetricsAtMs: number | null = null;

  #trajectoryRaw: Vec3[] = [];
  #trajectoryCorrected: Vec3[] = [];
  #lastScenePublishMs = Number.NEGATIVE_INFINITY;

  #lastPoseArrivalMs: number | null = null;
  #fps = 0;
  #visibleMarkers = new Map<number, number>();
  #lastCorrection: LastCorrectionMetrics | null = null;

  constructor(options: FoxgloveGatewayOptions) {
    this.#markerMap = options.markerMap;
    this.#logger = options.logger;
    this.#host = options.host ?? DEFAULTS.host;
    this.#port = options.port ?? DEFAULTS.port;
    this.#options = {
      snapshotIntervalMs: options.snapshotIntervalMs ?? DEFAULTS.snapshotIntervalMs,
      sceneIntervalMs: options.sceneIntervalMs ?? DEFAULTS.sceneIntervalMs,
      trajectoryMaxPoints: options.trajectoryMaxPoints ?? DEFAULTS.trajectoryMaxPoints,
      trajectoryMinDistanceM: options.trajectoryMinDistanceM ?? DEFAULTS.trajectoryMinDistanceM,
      markerVisibilityWindowMs:
        options.markerVisibilityWindowMs ?? DEFAULTS.markerVisibilityWindowMs,
    };

    // El paquete ws-protocol se publica como CommonJS. El import default evita
    // el error "does not provide an export named FoxgloveServer" de ESM.
    this.#foxglove = new wsProtocol.FoxgloveServer({
      name: 'vio-marker-fusion',
      supportedEncodings: ['json'],
      metadata: {
        project: 'VIO con marcadores fiduciarios',
        phase: '2',
      },
    });

    this.#channels = {
      tf: this.#addChannel(
        FOXGLOVE_TOPICS.tf,
        'foxglove.FrameTransforms',
        foxgloveJsonSchemas.FrameTransforms,
      ),
      poseRaw: this.#addChannel(
        FOXGLOVE_TOPICS.poseRaw,
        'foxglove.PoseInFrame',
        foxgloveJsonSchemas.PoseInFrame,
      ),
      poseCorrected: this.#addChannel(
        FOXGLOVE_TOPICS.poseCorrected,
        'foxglove.PoseInFrame',
        foxgloveJsonSchemas.PoseInFrame,
      ),
      markers: this.#addChannel(
        FOXGLOVE_TOPICS.markers,
        'foxglove.SceneUpdate',
        foxgloveJsonSchemas.SceneUpdate,
      ),
      metrics: this.#addChannel(FOXGLOVE_TOPICS.metrics, 'vio.Metrics', METRICS_SCHEMA),
    };

    this.#foxglove.on('subscribe', (channelId) => {
      this.#subscribed.add(channelId);
      this.#publishSnapshot(channelId);
    });
    this.#foxglove.on('unsubscribe', (channelId) => {
      this.#subscribed.delete(channelId);
    });
    this.#foxglove.on('error', (error) => {
      this.#logger.error('Error del protocolo Foxglove:', error);
    });
  }

  async listen(): Promise<void> {
    if (this.#wss) {
      throw new Error('El servidor Foxglove ya está escuchando');
    }
    if (this.#closed) {
      throw new Error('El servidor Foxglove ya fue cerrado');
    }

    const wss = new WebSocketServer({
      host: this.#host,
      port: this.#port,
      handleProtocols: (protocols) => this.#foxglove.handleProtocols(protocols),
    });

    wss.on('connection', (socket, request) => {
      const name = `${request.socket.remoteAddress ?? '?'}:${request.socket.remotePort ?? '?'}`;
      this.#logger.info(`Cliente Foxglove conectado desde ${name}`);
      this.#foxglove.handleConnection(socket as unknown as IWebSocket, name);
    });
    wss.on('error', (error) => {
      this.#logger.error('Error del servidor Foxglove:', error);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const onListening = (): void => {
          wss.off('error', onError);
          resolve();
        };
        const onError = (error: Error): void => {
          wss.off('listening', onListening);
          reject(error);
        };
        wss.once('listening', onListening);
        wss.once('error', onError);
      });
    } catch (error) {
      try {
        wss.close();
      } catch {
        // El servidor pudo haber fallado antes de quedar escuchando.
      }
      throw error;
    }

    this.#wss = wss;
    const address = wss.address();
    if (typeof address === 'object' && address !== null) {
      this.#port = address.port;
    }

    if (this.#options.snapshotIntervalMs > 0) {
      this.#snapshotTimer = setInterval(
        () => this.#publishPeriodicSnapshot(),
        this.#options.snapshotIntervalMs,
      );
      this.#snapshotTimer.unref();
    }

    this.#logger.info(`Foxglove WebSocket escuchando en ws://${this.#host}:${this.#port}`);
    this.#logger.info(`Canales: ${Object.values(FOXGLOVE_TOPICS).join(', ')} (JSON + JSON Schema)`);
  }

  get port(): number {
    return this.#port;
  }

  get host(): string {
    return this.#host;
  }

  getStats(): FoxgloveStats {
    return {
      host: this.#host,
      port: this.#port,
      clients: this.#wss?.clients.size ?? 0,
      subscribed_topics: [...this.#subscribed]
        .map((channelId) => this.#channelByTopic.get(channelId))
        .filter((topic): topic is string => topic !== undefined),
    };
  }

  isSubscribed(topic: string): boolean {
    for (const [channelId, channelTopic] of this.#channelByTopic) {
      if (channelTopic === topic) {
        return this.#subscribed.has(channelId);
      }
    }
    return false;
  }

  handleClientMessage(message: ClientMessage, context: FoxgloveMessageContext): void {
    if (this.#closed) {
      return;
    }

    switch (message.type) {
      case 'pose':
        this.#handlePose(message, context);
        break;
      case 'marker':
        this.#visibleMarkers.set(message.id, context.receivedAtMs);
        this.#logger.debug(
          `Marcador ${message.id} visto por cliente ${context.clientId} ` +
            `(reproj=${message.reproj_err_px.toFixed(2)} px)`,
        );
        break;
      case 'correction':
        this.#lastCorrection = {
          id: message.id,
          delta_p_m: message.delta_p_m,
          delta_angle_rad: message.delta_angle_rad,
          client_t_ms: message.t,
          server_t_ms: context.receivedAtMs,
        };
        this.#logger.debug(
          `Corrección del marcador ${message.id}: ` +
            `${message.delta_p_m.toFixed(3)} m, ${message.delta_angle_rad.toFixed(4)} rad`,
        );
        break;
      case 'hello':
        this.#logger.debug(
          `Hello de ${message.device}: ${message.image_size[0]}x${message.image_size[1]}, ` +
            `fx=${message.intrinsics.fx}, fy=${message.intrinsics.fy}`,
        );
        break;
    }
  }

  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    if (this.#snapshotTimer) {
      clearInterval(this.#snapshotTimer);
      this.#snapshotTimer = null;
    }
    const wss = this.#wss;
    this.#wss = null;
    if (!wss) {
      return;
    }
    for (const client of wss.clients) {
      client.terminate();
    }
    await new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
  }

  #addChannel(topic: string, schemaName: string, schema: object): ChannelId {
    const channelId = this.#foxglove.addChannel({
      topic,
      encoding: 'json',
      schemaName,
      schemaEncoding: 'jsonschema',
      schema: JSON.stringify(schema),
    });
    this.#channelByTopic.set(channelId, topic);
    return channelId;
  }

  #handlePose(
    message: Extract<ClientMessage, { type: 'pose' }>,
    context: FoxgloveMessageContext,
  ): void {
    const startedAt = performance.now();
    const timeMs = context.receivedAtMs;
    const time = msToTime(timeMs);

    // T_world_odom se toma de la pose corregida cuando existe. Antes de la
    // Fase 6 no hay corrección de mapa y se usa la transformación inicial.
    const T_world_odom = message.corrected
      ? compose(message.corrected, inverse(message.raw))
      : worldFromOdomInitial();
    const corrected = message.corrected ?? compose(T_world_odom, message.raw);

    const rawMessage: PoseInFrame = {
      timestamp: time,
      frame_id: 'odom',
      pose: toFoxglovePose(message.raw),
    };
    const correctedMessage: PoseInFrame = {
      timestamp: time,
      frame_id: 'world',
      pose: toFoxglovePose(corrected),
    };

    this.#lastPoses = { raw: message.raw, corrected, T_world_odom };
    this.#lastRaw = rawMessage;
    this.#lastCorrected = correctedMessage;
    this.#lastRawAtMs = timeMs;
    this.#lastCorrectedAtMs = timeMs;

    this.#send(this.#channels.poseRaw, timeMs, rawMessage);
    this.#send(this.#channels.poseCorrected, timeMs, correctedMessage);
    this.#send(this.#channels.tf, timeMs, this.#buildFrameTransforms(time));

    if (message.tracking !== 'lost') {
      this.#appendTrajectory(this.#trajectoryRaw, message.raw.p);
      this.#appendTrajectory(this.#trajectoryCorrected, corrected.p);
    }

    if (timeMs - this.#lastScenePublishMs >= this.#options.sceneIntervalMs) {
      this.#send(this.#channels.markers, timeMs, this.#buildScene(time));
      this.#lastScenePublishMs = timeMs;
    }

    this.#updateFps(timeMs);
    this.#pruneVisibleMarkers(timeMs);

    const metrics: MetricsMessage = {
      client_id: context.clientId,
      device: context.device,
      client_t_ms: message.t,
      server_t_ms: timeMs,
      processing_latency_ms: round(performance.now() - startedAt, 3),
      fps: round(this.#fps, 2),
      tracking: message.tracking,
      visible_markers: [...this.#visibleMarkers.keys()].sort((a, b) => a - b),
      last_correction: this.#lastCorrection ? { ...this.#lastCorrection } : null,
      world_odom_position: [...T_world_odom.p],
    };

    this.#lastMetrics = metrics;
    this.#lastMetricsAtMs = timeMs;
    this.#send(this.#channels.metrics, timeMs, metrics);
  }

  #updateFps(nowMs: number): void {
    if (this.#lastPoseArrivalMs !== null) {
      const dt = (nowMs - this.#lastPoseArrivalMs) / 1000;
      if (dt > 0 && dt <= 5) {
        const instant = 1 / dt;
        this.#fps = this.#fps === 0 ? instant : this.#fps * 0.8 + instant * 0.2;
      }
    }
    this.#lastPoseArrivalMs = nowMs;
  }

  #pruneVisibleMarkers(nowMs: number): void {
    for (const [id, seenAtMs] of this.#visibleMarkers) {
      if (nowMs - seenAtMs > this.#options.markerVisibilityWindowMs) {
        this.#visibleMarkers.delete(id);
      }
    }
  }

  #appendTrajectory(points: Vec3[], point: Vec3): void {
    const last = points[points.length - 1];
    if (last && vDistance(last, point) < this.#options.trajectoryMinDistanceM) {
      return;
    }
    points.push([point[0], point[1], point[2]]);
    if (points.length > this.#options.trajectoryMaxPoints) {
      points.splice(0, points.length - this.#options.trajectoryMaxPoints);
    }
  }

  #buildFrameTransforms(time: Time): FrameTransforms {
    const transforms: FrameTransform[] = [];
    if (this.#lastPoses) {
      transforms.push(
        frameTransform('world', 'odom', this.#lastPoses.T_world_odom, time),
        frameTransform('odom', 'camera', this.#lastPoses.raw, time),
      );
    }
    for (const marker of this.#markerMap.markers) {
      transforms.push(frameTransform('world', `marker_${marker.id}`, markerPose(marker), time));
    }
    return { transforms };
  }

  #buildScene(time: Time): SceneUpdate {
    const entities: SceneEntity[] = this.#markerMap.markers.map((marker) =>
      markerSceneEntity(marker, time),
    );
    const rawTrajectory = trajectorySceneEntity(
      'trajectory_raw',
      'odom',
      this.#trajectoryRaw,
      RAW_TRAJECTORY_COLOR,
      time,
    );
    if (rawTrajectory) {
      entities.push(rawTrajectory);
    }
    const correctedTrajectory = trajectorySceneEntity(
      'trajectory_corrected',
      'world',
      this.#trajectoryCorrected,
      CORRECTED_TRAJECTORY_COLOR,
      time,
    );
    if (correctedTrajectory) {
      entities.push(correctedTrajectory);
    }
    return { deletions: [], entities };
  }

  #publishPeriodicSnapshot(): void {
    if (this.#closed) {
      return;
    }
    const nowMs = Date.now();
    const time = msToTime(nowMs);
    this.#send(this.#channels.tf, nowMs, this.#buildFrameTransforms(time));
    this.#send(this.#channels.markers, nowMs, this.#buildScene(time));
  }

  #publishSnapshot(channelId: ChannelId): void {
    if (this.#closed) {
      return;
    }
    const nowMs = Date.now();
    if (channelId === this.#channels.tf) {
      this.#send(channelId, nowMs, this.#buildFrameTransforms(msToTime(nowMs)));
      return;
    }
    if (channelId === this.#channels.markers) {
      this.#send(channelId, nowMs, this.#buildScene(msToTime(nowMs)));
      return;
    }
    if (channelId === this.#channels.poseRaw && this.#lastRaw && this.#lastRawAtMs !== null) {
      this.#send(channelId, this.#lastRawAtMs, this.#lastRaw);
      return;
    }
    if (
      channelId === this.#channels.poseCorrected &&
      this.#lastCorrected &&
      this.#lastCorrectedAtMs !== null
    ) {
      this.#send(channelId, this.#lastCorrectedAtMs, this.#lastCorrected);
      return;
    }
    if (
      channelId === this.#channels.metrics &&
      this.#lastMetrics &&
      this.#lastMetricsAtMs !== null
    ) {
      this.#send(channelId, this.#lastMetricsAtMs, this.#lastMetrics);
    }
  }

  #send(channelId: ChannelId, timeMs: number, payload: unknown): void {
    if (this.#closed) {
      return;
    }
    try {
      const data = Buffer.from(JSON.stringify(payload), 'utf8');
      this.#foxglove.sendMessage(channelId, msToNs(timeMs), data);
    } catch (error) {
      this.#logger.warn('No se pudo publicar un mensaje en Foxglove:', error);
    }
  }
}

function toFoxglovePose(pose: Pose): FoxglovePose {
  const q = quatNormalize(pose.q);
  return {
    position: { x: pose.p[0], y: pose.p[1], z: pose.p[2] },
    orientation: { x: q[0], y: q[1], z: q[2], w: q[3] },
  };
}

function frameTransform(parent: string, child: string, pose: Pose, time: Time): FrameTransform {
  const foxglovePose = toFoxglovePose(pose);
  return {
    timestamp: time,
    parent_frame_id: parent,
    child_frame_id: child,
    translation: foxglovePose.position,
    rotation: foxglovePose.orientation,
  };
}

function markerSceneEntity(marker: MarkerDefinition, time: Time): SceneEntity {
  const pose = markerPose(marker);
  const cube: CubePrimitive = {
    pose: toFoxglovePose(pose),
    size: { x: marker.size_m, y: marker.size_m, z: 0.01 },
    color: MARKER_CUBE_COLOR,
  };
  const labelPosition = apply(pose, [0, 0, marker.size_m / 2 + 0.03]);
  const text: TextPrimitive = {
    pose: {
      position: { x: labelPosition[0], y: labelPosition[1], z: labelPosition[2] },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    },
    billboard: true,
    font_size: 0.15,
    scale_invariant: false,
    color: LABEL_COLOR,
    text: `ID ${marker.id}`,
  };
  return {
    timestamp: time,
    frame_id: 'world',
    id: `marker_${marker.id}`,
    lifetime: { sec: 0, nsec: 0 },
    frame_locked: false,
    metadata: [
      { key: 'id', value: String(marker.id) },
      { key: 'size_m', value: marker.size_m.toFixed(3) },
    ],
    arrows: [],
    cubes: [cube],
    spheres: [],
    cylinders: [],
    lines: [],
    triangles: [],
    texts: [text],
    models: [],
  };
}

function trajectorySceneEntity(
  id: string,
  frameId: string,
  points: Vec3[],
  color: Color,
  time: Time,
): SceneEntity | null {
  if (points.length < 2) {
    return null;
  }
  const line: LinePrimitive = {
    type: 0 as LineType,
    pose: {
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    },
    thickness: 0.015,
    scale_invariant: false,
    points: points.map((point): Point3 => ({ x: point[0], y: point[1], z: point[2] })),
    color,
    colors: [],
    indices: [],
  };
  return {
    timestamp: time,
    frame_id: frameId,
    id,
    lifetime: { sec: 0, nsec: 0 },
    frame_locked: false,
    metadata: [],
    arrows: [],
    cubes: [],
    spheres: [],
    cylinders: [],
    lines: [line],
    triangles: [],
    texts: [],
    models: [],
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
