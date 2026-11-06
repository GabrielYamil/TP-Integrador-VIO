import type { ClientMessage } from '@vio/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestClientOptions, WebSocketLike } from './ws-client';
import { IngestClient } from './ws-client';

const TEST_URL = 'wss://test.local/ingest';

class FakeSocket implements WebSocketLike {
  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readonly sent: string[] = [];
  closedWith: { code?: number; reason?: string } | null = null;

  send(data: string): void {
    if (this.readyState !== 1) {
      throw new Error('El socket no está abierto');
    }
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closedWith = { code, reason };
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  serverClose(code = 1006, reason = ''): void {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

function poseMessage(index: number): ClientMessage {
  return {
    type: 'pose',
    t: index,
    raw: { p: [0, 0, 0], q: [0, 0, 0, 1] },
    tracking: 'tracking',
  };
}

describe('IngestClient', () => {
  let sockets: FakeSocket[];
  let factoryCalls: string[];
  let now: number;
  let client: IngestClient | null;

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    factoryCalls = [];
    now = 1000;
    client = null;
  });

  afterEach(() => {
    client?.close();
    client = null;
    vi.useRealTimers();
  });

  function createClient(options: IngestClientOptions = {}): IngestClient {
    client = new IngestClient(TEST_URL, {
      reconnectBaseMs: 500,
      reconnectMaxMs: 4000,
      now: () => now,
      random: () => 0.5,
      webSocketFactory: (url) => {
        factoryCalls.push(url);
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      ...options,
    });
    return client;
  }

  it('sends a message immediately when the socket is open', () => {
    const subject = createClient();
    subject.connect();
    expect(subject.getStats().state).toBe('connecting');

    sockets[0].open();
    expect(subject.getStats().state).toBe('open');

    subject.send(poseMessage(1));

    expect(sockets[0].sent).toHaveLength(1);
    expect(JSON.parse(sockets[0].sent[0])).toMatchObject({ type: 'pose', t: 1 });
    expect(subject.getStats()).toMatchObject({ sent: 1, buffered: 0, lastSentAtMs: 1000 });
  });

  it('buffers messages until the connection opens and then flushes them in order', () => {
    const subject = createClient();
    subject.connect();
    subject.send(poseMessage(1));
    subject.send(poseMessage(2));

    expect(subject.getStats()).toMatchObject({ state: 'connecting', buffered: 2, sent: 0 });
    expect(sockets[0].sent).toHaveLength(0);

    sockets[0].open();

    expect(sockets[0].sent.map((text) => JSON.parse(text).t)).toEqual([1, 2]);
    expect(subject.getStats()).toMatchObject({ state: 'open', buffered: 0, sent: 2 });
  });

  it('drops the oldest messages when the buffer exceeds its limit', () => {
    const subject = createClient({ maxBufferedMessages: 3 });
    subject.connect();

    for (let index = 1; index <= 5; index += 1) {
      subject.send(poseMessage(index));
    }

    expect(subject.getStats()).toMatchObject({ buffered: 3, dropped: 2 });

    sockets[0].open();

    expect(sockets[0].sent.map((text) => JSON.parse(text).t)).toEqual([3, 4, 5]);
    expect(subject.getStats()).toMatchObject({ sent: 3, buffered: 0, dropped: 2 });
  });

  it('discards buffered messages that are older than maxBufferAgeMs', () => {
    const subject = createClient({ maxBufferAgeMs: 3000 });
    subject.connect();
    subject.send(poseMessage(1));

    now += 4000;
    sockets[0].open();

    expect(sockets[0].sent).toHaveLength(0);
    expect(subject.getStats()).toMatchObject({ sent: 0, dropped: 1, buffered: 0 });
  });

  it('reconnects with exponential backoff and jitter', () => {
    const subject = createClient();
    subject.connect();
    sockets[0].open();
    sockets[0].serverClose(1006, 'network');

    expect(subject.getStats()).toMatchObject({ state: 'reconnecting', reconnects: 1 });

    vi.advanceTimersByTime(499);
    expect(factoryCalls).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(factoryCalls).toHaveLength(2);

    // El segundo intento ocurre sin que el socket llegue a abrir: el backoff
    // tiene que duplicarse de 500 ms a 1000 ms.
    sockets[1].serverClose(1006, 'still down');
    expect(subject.getStats()).toMatchObject({ state: 'reconnecting', reconnects: 2 });

    vi.advanceTimersByTime(999);
    expect(factoryCalls).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(factoryCalls).toHaveLength(3);

    sockets[2].open();
    expect(subject.getStats().state).toBe('open');
  });

  it('stops reconnecting and drops new messages after close()', () => {
    const subject = createClient();
    subject.connect();
    sockets[0].open();
    subject.close();

    expect(subject.getStats().state).toBe('closed');

    subject.send(poseMessage(1));
    expect(subject.getStats()).toMatchObject({ dropped: 1, sent: 0 });

    vi.advanceTimersByTime(10000);
    expect(factoryCalls).toHaveLength(1);
    expect(subject.getStats().state).toBe('closed');
  });

  it('schedules a reconnect when the WebSocket constructor throws', () => {
    let attempts = 0;
    const subject = createClient({
      webSocketFactory: () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('boom');
        }
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    });

    subject.connect();
    expect(subject.getStats()).toMatchObject({
      state: 'reconnecting',
      reconnects: 1,
      lastError: 'boom',
    });

    vi.advanceTimersByTime(500);
    expect(attempts).toBe(2);
    expect(subject.getStats().state).toBe('connecting');
  });
});
