import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { ClientMessage } from '@vio/shared';
import { IngestServer } from './ingest';
import type { IngestMessageContext } from './ingest';
import { createLogger } from './logging';

const logger = createLogger('ingest-test', 'silent');

interface Received {
  message: ClientMessage;
  context: IngestMessageContext;
}

interface Harness {
  ingest: IngestServer;
  server: ReturnType<typeof createServer>;
  socket: WebSocket;
  received: Received[];
  close(): Promise<void>;
}

async function openHarness(): Promise<Harness> {
  const received: Received[] = [];
  const server = createServer();
  const ingest = new IngestServer({
    server,
    logger,
    heartbeatIntervalMs: 0,
    onMessage: (message, context) => {
      received.push({ message, context });
    },
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = (server.address() as AddressInfo).port;
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ingest`);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });

  return {
    ingest,
    server,
    socket,
    received,
    async close() {
      socket.close();
      await ingest.close();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

let harness: Harness | undefined;

afterEach(async () => {
  if (harness) {
    await harness.close();
    harness = undefined;
  }
});

describe('IngestServer', () => {
  it('accepts valid messages and discards invalid or binary ones', async () => {
    harness = await openHarness();
    const hello = {
      type: 'hello',
      device: 'Test Phone',
      intrinsics: { fx: 500, fy: 501, cx: 320, cy: 240 },
      image_size: [640, 480],
    };
    const pose = {
      type: 'pose',
      t: 1234.5,
      raw: { p: [0, 1.4, 0], q: [0, 0, 0, 1] },
      corrected: { p: [0, 0, 1.4], q: [0.5, -0.5, -0.5, 0.5] },
      tracking: 'tracking',
    };

    harness.socket.send('not json');
    harness.socket.send(JSON.stringify({ type: 'pose', t: 10 }));
    harness.socket.send(JSON.stringify(hello));
    harness.socket.send(Buffer.from([1, 2, 3]));
    harness.socket.send(JSON.stringify(pose));

    await waitFor(() => harness?.received.length === 2, 2000, 'dos mensajes válidos');

    expect(harness.received.map((entry) => entry.message.type)).toEqual(['hello', 'pose']);
    expect(harness.received[0]!.context.device).toBe('Test Phone');
    expect(harness.received[0]!.context.clientId).toBe(1);
    expect(harness.received[0]!.context.receivedAtMs).toBeGreaterThan(0);
    expect(harness.received[1]!.message).toEqual(pose);
    expect(harness.received[1]!.context.device).toBe('Test Phone');

    const stats = harness.ingest.getStats();
    expect(stats.path).toBe('/ingest');
    expect(stats.clients).toBe(1);
    expect(stats.devices).toEqual(['Test Phone']);
    expect(stats.messagesReceived).toBe(5);
    expect(stats.messagesValid).toBe(2);
    expect(stats.messagesInvalid).toBe(3);
    expect(stats.byType).toEqual({ pose: 1, marker: 0, correction: 0, hello: 1 });
    expect(stats.lastMessageAtMs).toBeGreaterThan(0);
  });

  it('rejects clients that connect to another path', async () => {
    const server = createServer();
    const ingest = new IngestServer({ server, logger, heartbeatIntervalMs: 0 });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const port = (server.address() as AddressInfo).port;

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/otra-ruta`);
      socket.once('open', () => {
        socket.close();
        reject(new Error('La conexión a otra ruta no debería abrirse'));
      });
      socket.once('error', () => resolve());
      socket.once('close', () => resolve());
    });

    expect(ingest.getStats().clients).toBe(0);
    await ingest.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });
});

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
