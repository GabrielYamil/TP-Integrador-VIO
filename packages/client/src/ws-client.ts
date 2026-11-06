/**
 * Cliente WebSocket del relay `/ingest` (Fase 3).
 *
 * Requisitos del plan:
 * - reconexión automática con backoff exponencial;
 * - buffer acotado para no crecer sin límite si se cae la red;
 * - descarte de mensajes viejos cuando la conexión vuelve.
 *
 * La clase no toca el DOM y permite inyectar el constructor de WebSocket, el
 * reloj y el generador aleatorio para poder testearla en Node.
 */
import type { ClientMessage } from '@vio/shared';
import { CLIENT_CONFIG } from './client-config';

export type IngestConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface WebSocketLike {
  readonly readyState: number;
  onopen: ((event: unknown) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface IngestStats {
  state: IngestConnectionState;
  buffered: number;
  sent: number;
  dropped: number;
  reconnects: number;
  lastError: string | null;
  lastSentAtMs: number | null;
}

export interface IngestClientOptions {
  maxBufferedMessages?: number;
  maxBufferAgeMs?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  reconnectJitter?: number;
  webSocketFactory?: (url: string) => WebSocketLike;
  now?: () => number;
  random?: () => number;
  onStateChange?: (state: IngestConnectionState, stats: IngestStats) => void;
  logger?: (message: string, level?: 'info' | 'warn' | 'error') => void;
}

interface QueuedMessage {
  text: string;
  queuedAtMs: number;
}

const WS_OPEN = 1;
const MAX_BACKOFF_EXPONENT = 8;

export class IngestClient {
  readonly #url: string;
  readonly #maxBufferedMessages: number;
  readonly #maxBufferAgeMs: number;
  readonly #reconnectBaseMs: number;
  readonly #reconnectMaxMs: number;
  readonly #reconnectJitter: number;
  readonly #webSocketFactory: (url: string) => WebSocketLike;
  readonly #now: () => number;
  readonly #random: () => number;
  readonly #onStateChange: (state: IngestConnectionState, stats: IngestStats) => void;
  readonly #logger: (message: string, level?: 'info' | 'warn' | 'error') => void;

  #socket: WebSocketLike | null = null;
  #state: IngestConnectionState = 'idle';
  #buffer: QueuedMessage[] = [];
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #attempt = 0;
  #sent = 0;
  #dropped = 0;
  #reconnects = 0;
  #lastError: string | null = null;
  #lastSentAtMs: number | null = null;
  #closedByUser = false;

  constructor(url: string, options: IngestClientOptions = {}) {
    this.#url = url;
    this.#maxBufferedMessages =
      options.maxBufferedMessages ?? CLIENT_CONFIG.ingest.maxBufferedMessages;
    this.#maxBufferAgeMs = options.maxBufferAgeMs ?? CLIENT_CONFIG.ingest.maxBufferAgeMs;
    this.#reconnectBaseMs = options.reconnectBaseMs ?? CLIENT_CONFIG.ingest.reconnectBaseMs;
    this.#reconnectMaxMs = options.reconnectMaxMs ?? CLIENT_CONFIG.ingest.reconnectMaxMs;
    this.#reconnectJitter = options.reconnectJitter ?? CLIENT_CONFIG.ingest.reconnectJitter;
    this.#webSocketFactory =
      options.webSocketFactory ?? ((target) => new WebSocket(target) as unknown as WebSocketLike);
    this.#now = options.now ?? (() => Date.now());
    this.#random = options.random ?? (() => Math.random());
    this.#onStateChange = options.onStateChange ?? (() => undefined);
    this.#logger = options.logger ?? (() => undefined);
  }

  get url(): string {
    return this.#url;
  }

  getStats(): IngestStats {
    return {
      state: this.#state,
      buffered: this.#buffer.length,
      sent: this.#sent,
      dropped: this.#dropped,
      reconnects: this.#reconnects,
      lastError: this.#lastError,
      lastSentAtMs: this.#lastSentAtMs,
    };
  }

  connect(): void {
    if (this.#state === 'open' || this.#state === 'connecting') {
      return;
    }
    if (this.#state === 'closed') {
      this.#resetCounters();
    }
    this.#closedByUser = false;
    this.#clearReconnectTimer();
    this.#openSocket();
  }

  send(message: ClientMessage): void {
    const text = JSON.stringify(message);
    if (this.#state === 'open' && this.#socket?.readyState === WS_OPEN) {
      try {
        this.#socket.send(text);
        this.#sent += 1;
        this.#lastSentAtMs = this.#now();
        return;
      } catch (error) {
        this.#lastError = errorMessage(error);
        this.#logger(`No se pudo enviar por WebSocket: ${this.#lastError}`, 'warn');
        this.#enqueue(text);
        try {
          this.#socket.close();
        } catch {
          // El cierre ya puede estar en curso.
        }
        return;
      }
    }

    if (this.#closedByUser || this.#state === 'closed') {
      this.#dropped += 1;
      return;
    }
    this.#enqueue(text);
  }

  close(code = 1000, reason = 'client stopped'): void {
    this.#closedByUser = true;
    this.#clearReconnectTimer();
    const socket = this.#socket;
    this.#socket = null;
    if (socket) {
      try {
        socket.close(code, reason);
      } catch {
        // No hay nada más que hacer si el socket ya está cerrado.
      }
    }
    this.#buffer = [];
    this.#state = 'closed';
    this.#emit();
  }

  #resetCounters(): void {
    this.#buffer = [];
    this.#sent = 0;
    this.#dropped = 0;
    this.#reconnects = 0;
    this.#attempt = 0;
    this.#lastError = null;
    this.#lastSentAtMs = null;
  }

  #openSocket(): void {
    this.#clearReconnectTimer();
    this.#state = 'connecting';
    this.#emit();

    let socket: WebSocketLike;
    try {
      socket = this.#webSocketFactory(this.#url);
    } catch (error) {
      this.#lastError = errorMessage(error);
      this.#logger(`No se pudo crear el WebSocket: ${this.#lastError}`, 'error');
      this.#scheduleReconnect();
      return;
    }

    this.#socket = socket;

    socket.onopen = () => {
      if (this.#socket !== socket) {
        return;
      }
      this.#attempt = 0;
      this.#state = 'open';
      this.#emit();
      this.#flush();
    };

    socket.onclose = (event) => {
      if (this.#socket !== socket) {
        return;
      }
      this.#socket = null;
      if (this.#closedByUser) {
        this.#state = 'closed';
        this.#emit();
        return;
      }
      const code = event?.code ?? 0;
      const reason = event?.reason ? `: ${event.reason}` : '';
      this.#lastError = `WebSocket cerrado (${code})${reason}`;
      this.#logger(this.#lastError, 'warn');
      this.#scheduleReconnect();
    };

    socket.onerror = () => {
      if (this.#socket !== socket) {
        return;
      }
      this.#lastError = 'Error de WebSocket';
      this.#logger(this.#lastError, 'warn');
      this.#emit();
    };
  }

  #scheduleReconnect(): void {
    if (this.#closedByUser) {
      return;
    }
    this.#clearReconnectTimer();
    const exponent = Math.min(this.#attempt, MAX_BACKOFF_EXPONENT);
    const base = Math.min(this.#reconnectBaseMs * 2 ** exponent, this.#reconnectMaxMs);
    const jitter = 1 + (this.#random() * 2 - 1) * this.#reconnectJitter;
    const delay = Math.max(0, Math.round(base * jitter));

    this.#attempt += 1;
    this.#reconnects += 1;
    this.#state = 'reconnecting';
    this.#emit();
    this.#logger(`Relay desconectado; reintentando en ${delay} ms`, 'warn');

    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      if (!this.#closedByUser) {
        this.#openSocket();
      }
    }, delay);
  }

  #enqueue(text: string): void {
    this.#buffer.push({ text, queuedAtMs: this.#now() });
    while (this.#buffer.length > this.#maxBufferedMessages) {
      this.#buffer.shift();
      this.#dropped += 1;
    }
  }

  #flush(): void {
    const socket = this.#socket;
    if (!socket || socket.readyState !== WS_OPEN) {
      return;
    }

    const pending = this.#buffer;
    this.#buffer = [];
    const now = this.#now();

    for (let index = 0; index < pending.length; index += 1) {
      const entry = pending[index];
      if (now - entry.queuedAtMs > this.#maxBufferAgeMs) {
        this.#dropped += 1;
        continue;
      }
      try {
        socket.send(entry.text);
        this.#sent += 1;
        this.#lastSentAtMs = now;
      } catch (error) {
        this.#lastError = errorMessage(error);
        this.#logger(`No se pudo vaciar el buffer: ${this.#lastError}`, 'warn');
        this.#buffer = pending.slice(index);
        try {
          socket.close();
        } catch {
          // El cierre ya puede estar en curso.
        }
        return;
      }
    }

    this.#emit();
  }

  #clearReconnectTimer(): void {
    if (this.#reconnectTimer !== null) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
  }

  #emit(): void {
    this.#onStateChange(this.#state, this.getStats());
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
