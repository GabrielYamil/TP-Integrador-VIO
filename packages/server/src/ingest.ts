/**
 * Relay WebSocket seguro para la telemetría del celular.
 *
 * Se monta sobre el mismo servidor HTTPS que sirve el cliente, en la ruta
 * `/ingest`. Cada mensaje de texto se valida con los esquemas zod de
 * @vio/shared; los mensajes inválidos o binarios se descartan y se registran.
 *
 * El relay no publica nada: solo entrega los mensajes válidos a un callback.
 * La traducción a Foxglove vive en `foxglove.ts`.
 */
import type { Server } from 'node:http';
import { Buffer } from 'node:buffer';
import type WebSocket from 'ws';
import { WebSocketServer } from 'ws';
import type { ClientMessage } from '@vio/shared';
import { parseClientMessageJson } from '@vio/shared';
import type { Logger } from './logging';

export interface IngestClientInfo {
  id: number;
  device: string;
  remoteAddress: string;
  connectedAtMs: number;
  lastMessageAtMs: number | null;
  messages: number;
  invalidMessages: number;
}

export interface IngestMessageContext {
  clientId: number;
  device: string;
  /** Timestamp de recepción del servidor, en milisegundos de época. */
  receivedAtMs: number;
}

type ClientMessageType = ClientMessage['type'];

export interface IngestStats {
  path: string;
  clients: number;
  devices: string[];
  messagesReceived: number;
  messagesValid: number;
  messagesInvalid: number;
  byType: Record<ClientMessageType, number>;
  lastMessageAtMs: number | null;
}

export interface IngestServerOptions {
  server: Server;
  logger: Logger;
  path?: string;
  onMessage?: (message: ClientMessage, context: IngestMessageContext) => void;
  onClientConnected?: (client: IngestClientInfo) => void;
  onClientDisconnected?: (client: IngestClientInfo) => void;
  /** 0 desactiva el ping/pong de liveness. */
  heartbeatIntervalMs?: number;
  maxPayloadBytes?: number;
}

interface ClientEntry {
  info: IngestClientInfo;
  alive: boolean;
}

const DEFAULT_PATH = '/ingest';
const DEFAULT_HEARTBEAT_MS = 30_000;
const DEFAULT_MAX_PAYLOAD_BYTES = 1_048_576;

export class IngestServer {
  readonly path: string;
  readonly #logger: Logger;
  readonly #options: IngestServerOptions;
  readonly #wss: WebSocketServer;
  readonly #clients = new Map<WebSocket, ClientEntry>();
  #nextClientId = 1;
  #heartbeat: NodeJS.Timeout | null = null;
  #closed = false;
  #stats = {
    received: 0,
    valid: 0,
    invalid: 0,
    byType: {
      pose: 0,
      marker: 0,
      correction: 0,
      hello: 0,
    } satisfies Record<ClientMessageType, number>,
    lastMessageAtMs: null as number | null,
  };

  constructor(options: IngestServerOptions) {
    this.#options = options;
    this.#logger = options.logger;
    this.path = options.path ?? DEFAULT_PATH;

    this.#wss = new WebSocketServer({
      server: options.server,
      path: this.path,
      maxPayload: options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES,
    });

    this.#wss.on('connection', (socket, request) => {
      this.#handleConnection(socket, request.socket.remoteAddress ?? 'desconocido');
    });
    this.#wss.on('error', (error) => {
      this.#logger.error('Error del servidor WebSocket de ingesta:', error);
    });

    const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS;
    if (heartbeatIntervalMs > 0) {
      this.#heartbeat = setInterval(() => this.#checkClients(), heartbeatIntervalMs);
      this.#heartbeat.unref();
    }
  }

  getStats(): IngestStats {
    return {
      path: this.path,
      clients: this.#clients.size,
      devices: [...new Set([...this.#clients.values()].map((entry) => entry.info.device))],
      messagesReceived: this.#stats.received,
      messagesValid: this.#stats.valid,
      messagesInvalid: this.#stats.invalid,
      byType: { ...this.#stats.byType },
      lastMessageAtMs: this.#stats.lastMessageAtMs,
    };
  }

  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    if (this.#heartbeat) {
      clearInterval(this.#heartbeat);
      this.#heartbeat = null;
    }
    for (const socket of this.#clients.keys()) {
      socket.terminate();
    }
    this.#clients.clear();
    await new Promise<void>((resolve) => {
      this.#wss.close(() => resolve());
    });
  }

  #handleConnection(socket: WebSocket, remoteAddress: string): void {
    const info: IngestClientInfo = {
      id: this.#nextClientId++,
      device: 'desconocido',
      remoteAddress,
      connectedAtMs: Date.now(),
      lastMessageAtMs: null,
      messages: 0,
      invalidMessages: 0,
    };
    this.#clients.set(socket, { info, alive: true });
    this.#logger.info(`Cliente ${info.id} conectado desde ${remoteAddress} (${this.path})`);
    this.#options.onClientConnected?.({ ...info });

    socket.on('pong', () => {
      const entry = this.#clients.get(socket);
      if (entry) {
        entry.alive = true;
      }
    });

    socket.on('message', (data, isBinary) => {
      this.#handleMessage(socket, data, isBinary);
    });

    socket.on('error', (error) => {
      this.#logger.warn(`Error en el WebSocket del cliente ${info.id}:`, error);
    });

    socket.on('close', (code, reason) => {
      const entry = this.#clients.get(socket);
      this.#clients.delete(socket);
      const reasonText = reason.toString('utf8');
      this.#logger.info(
        `Cliente ${info.id} desconectado (code=${code}` +
          `${reasonText ? `, reason=${reasonText}` : ''})`,
      );
      if (entry) {
        this.#options.onClientDisconnected?.({ ...entry.info });
      }
    });
  }

  #handleMessage(socket: WebSocket, data: WebSocket.RawData, isBinary: boolean): void {
    const entry = this.#clients.get(socket);
    if (!entry) {
      return;
    }

    const receivedAtMs = Date.now();
    entry.info.lastMessageAtMs = receivedAtMs;
    entry.info.messages += 1;
    entry.alive = true;
    this.#stats.received += 1;
    this.#stats.lastMessageAtMs = receivedAtMs;

    if (isBinary) {
      this.#reject(entry, 'mensaje binario no soportado');
      return;
    }

    const result = parseClientMessageJson(rawDataToText(data));
    if (!result.ok) {
      this.#reject(entry, result.error);
      return;
    }

    const message = result.message;
    this.#stats.valid += 1;
    this.#stats.byType[message.type] += 1;

    if (message.type === 'hello') {
      entry.info.device = message.device;
      this.#logger.info(`Cliente ${entry.info.id} identificado como "${message.device}"`);
    }

    try {
      this.#options.onMessage?.(message, {
        clientId: entry.info.id,
        device: entry.info.device,
        receivedAtMs,
      });
    } catch (error) {
      this.#logger.error(
        `Error procesando un mensaje "${message.type}" del cliente ${entry.info.id}:`,
        error,
      );
    }
  }

  #reject(entry: ClientEntry, reason: string): void {
    this.#stats.invalid += 1;
    entry.info.invalidMessages += 1;
    this.#logger.warn(`Mensaje inválido del cliente ${entry.info.id}: ${reason}`);
  }

  #checkClients(): void {
    for (const [socket, entry] of this.#clients) {
      if (!entry.alive) {
        this.#logger.warn(`Cliente ${entry.info.id} sin respuesta; cerrando conexión`);
        socket.terminate();
        continue;
      }
      entry.alive = false;
      try {
        socket.ping();
      } catch (error) {
        this.#logger.warn(`No se pudo hacer ping al cliente ${entry.info.id}:`, error);
      }
    }
  }
}

function rawDataToText(data: WebSocket.RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }
  return data.toString('utf8');
}
