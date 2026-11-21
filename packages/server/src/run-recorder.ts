import { randomUUID } from 'node:crypto';
import { mkdir, open, rename } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { CameraCalibration, ClientMessage, MarkerMap } from '@vio/shared';

export const RUN_RECORDER_QUEUE_LIMIT = 10_000;
export const RUN_RECORDER_CLOSE_TIMEOUT_MS = 3_000;

export type RunCompletionStatus =
  | 'complete'
  | 'complete_pending_close'
  | 'incomplete_write_error'
  | 'incomplete_queue_limit'
  | 'incomplete_close_timeout'
  | 'incomplete_close_error'
  | 'incomplete_manifest_error';

export interface RunRecorderFileAdapter {
  mkdir(path: string): Promise<void>;
  open(path: string, flags: 'wx'): Promise<unknown>;
  write(handle: unknown, text: string): Promise<void>;
  sync(handle: unknown): Promise<void>;
  close(handle: unknown): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

export interface RunRecorderContext {
  clientId: number;
  device: string;
  receivedAtMs: number;
}

export interface RunRecorderOptions {
  runsDir: string;
  server: {
    name: string;
    version: string;
    tls: boolean;
    httpHost: string;
    httpPort: number;
    ingestPath: string;
    foxgloveHost: string;
    foxglovePort: number;
  };
  markerMap: MarkerMap;
  markerMapSource: string;
  cameraCalibration: CameraCalibration | null;
  cameraCalibrationSource?: string;
  cameraCalibrationError?: string | null;
  fileAdapter?: RunRecorderFileAdapter;
}

export interface RunRecorderStats {
  state: 'disabled' | 'recording' | 'closing' | 'closing_timeout' | 'closed';
  validReceived: number;
  queuedRecords: number;
  droppedBeforeQueue: number;
  droppedAfterQueue: number;
  droppedRecords: number;
  writtenRecords: number;
  writeErrors: number;
  activeQueueRecords: number;
  runStartWritten: boolean;
  runEndWritten: boolean;
}

export interface RunRecorderCloseResult {
  status: RunCompletionStatus | 'run_end_not_written';
  runEndWritten: boolean;
  manifestPublished: boolean;
  stats: RunRecorderStats;
}

interface RunRecord {
  format: 'vio-run';
  format_version: 1;
  record_type: 'run_start' | 'client_message' | 'run_end';
  run_id: string;
  sequence: number;
  server_time_ms: number;
  [key: string]: unknown;
}

export function validateRunManifest(
  input: unknown,
  expectedRunId: string,
  expectedJsonlFile: string,
): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return false;
  }
  const manifest = input as Record<string, unknown>;
  if (
    manifest.format !== 'vio-run-manifest' ||
    manifest.format_version !== 1 ||
    manifest.run_id !== expectedRunId ||
    manifest.jsonl_file !== expectedJsonlFile ||
    manifest.status !== 'complete'
  ) {
    return false;
  }

  const recording = manifest.recording;
  if (!recording || typeof recording !== 'object' || Array.isArray(recording)) {
    return false;
  }
  const values = recording as Record<string, unknown>;
  const fields = [
    'valid_received',
    'queued_records',
    'dropped_before_queue',
    'dropped_after_queue',
    'dropped_records',
    'written_records',
    'write_errors',
    'last_sequence',
  ];

  for (const field of fields) {
    const value = values[field];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      return false;
    }
  }

  const validReceived = values.valid_received as number;
  const queuedRecords = values.queued_records as number;
  const droppedBeforeQueue = values.dropped_before_queue as number;
  const droppedAfterQueue = values.dropped_after_queue as number;
  const droppedRecords = values.dropped_records as number;
  const writtenRecords = values.written_records as number;

  if (validReceived !== queuedRecords + droppedBeforeQueue) {
    return false;
  }
  if (queuedRecords !== writtenRecords + droppedAfterQueue) {
    return false;
  }
  if (droppedRecords !== droppedBeforeQueue + droppedAfterQueue) {
    return false;
  }
  if ((values.write_errors as number) !== 0) {
    return false;
  }
  if (values.run_start_written !== true || values.run_end_written !== true) {
    return false;
  }
  if (values.jsonl_closed !== true) {
    return false;
  }
  return true;
}

function utcTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:.]/g, '').replace('Z', 'Z');
}

const defaultFileAdapter: RunRecorderFileAdapter = {
  async mkdir(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  },
  async open(path: string, flags: 'wx'): Promise<unknown> {
    return open(path, flags);
  },
  async write(handle: unknown, text: string): Promise<void> {
    await (handle as FileHandle).writeFile(text, 'utf8');
  },
  async sync(handle: unknown): Promise<void> {
    await (handle as FileHandle).sync();
  },
  async close(handle: unknown): Promise<void> {
    await (handle as FileHandle).close();
  },
  async rename(from: string, to: string): Promise<void> {
    await rename(from, to);
  },
};

export class RunRecorder {
  readonly #options: RunRecorderOptions;
  readonly #adapter: RunRecorderFileAdapter;
  readonly #runId: string;
  readonly #filePath: string;
  readonly #manifestPath: string;
  readonly #manifestTempPath: string;
  #file: unknown | null = null;
  #sequence = 0;
  #state: RunRecorderStats['state'] = 'disabled';
  #queue: RunRecord[] = [];
  #inFlight = false;
  #pumpPromise: Promise<void> | null = null;
  #validReceived = 0;
  #queuedRecords = 0;
  #droppedBeforeQueue = 0;
  #droppedAfterQueue = 0;
  #writtenRecords = 0;
  #writeErrors = 0;
  #runStartWritten = false;
  #runEndWritten = false;
  #manifestPublished = false;
  #closeState: RunCompletionStatus | null = null;
  #closePromise: Promise<RunRecorderCloseResult> | null = null;
  #jsonlClosePromise: Promise<boolean> | null = null;
  #lateCleanupPromise: Promise<void> | null = null;
  #tempClosePromise: Promise<void> | null = null;
  #tempHandle: unknown | null = null;
  #startedAtMs = 0;
  #byType = {
    hello: 0,
    pose: 0,
    marker: 0,
    correction: 0,
  };

  constructor(options: RunRecorderOptions) {
    this.#options = options;
    this.#adapter = options.fileAdapter ?? defaultFileAdapter;
    const now = new Date();
    this.#runId = `${utcTimestamp(now)}-${randomUUID().slice(0, 8)}`;
    const dateDir = now.toISOString().slice(0, 10);
    this.#filePath = join(options.runsDir, dateDir, `${this.#runId}.jsonl`);
    this.#manifestPath = join(options.runsDir, dateDir, `${this.#runId}.manifest.json`);
    this.#manifestTempPath = `${this.#manifestPath}.tmp`;
  }

  get runId(): string {
    return this.#runId;
  }

  get filePath(): string {
    return this.#filePath;
  }

  get manifestPath(): string {
    return this.#manifestPath;
  }

  getStats(): RunRecorderStats {
    return {
      state: this.#state,
      validReceived: this.#validReceived,
      queuedRecords: this.#queuedRecords,
      droppedBeforeQueue: this.#droppedBeforeQueue,
      droppedAfterQueue: this.#droppedAfterQueue,
      droppedRecords: this.#droppedBeforeQueue + this.#droppedAfterQueue,
      writtenRecords: this.#writtenRecords,
      writeErrors: this.#writeErrors,
      activeQueueRecords: (this.#inFlight ? 1 : 0) + this.#queue.length,
      runStartWritten: this.#runStartWritten,
      runEndWritten: this.#runEndWritten,
    };
  }

  async initialize(deadlineMs: number = Date.now() + RUN_RECORDER_CLOSE_TIMEOUT_MS): Promise<void> {
    if (this.#state !== 'disabled') {
      throw new Error('El grabador ya fue inicializado');
    }

    try {
      await this.#adapter.mkdir(dirname(this.#filePath));
      this.#file = await this.#adapter.open(this.#filePath, 'wx');
    } catch (error) {
      await this.#releaseFileWithoutDeadline();
      this.#state = 'disabled';
      throw error;
    }

    this.#startedAtMs = Date.now();
    const record: RunRecord = {
      format: 'vio-run',
      format_version: 1,
      record_type: 'run_start',
      run_id: this.#runId,
      sequence: this.#sequence,
      server_time_ms: this.#startedAtMs,
      metadata: {
        started_at_ms: this.#startedAtMs,
        server: this.#options.server,
        marker_map: {
          source: this.#options.markerMapSource,
          frame_id: this.#options.markerMap.frame_id,
          dictionary: this.#options.markerMap.dictionary,
          markers: this.#options.markerMap.markers,
        },
        configuration: {
          correction_mode: 'not_reported',
          trajectory: 'not_reported',
          drift: 'not_reported',
          pose_rate_hz: 'not_reported',
          camera_capture_hz: 'not_reported',
          camera_max_dimension: 'not_reported',
        },
        camera_calibration: this.#cameraCalibrationMetadata(),
      },
    };

    const startOperation = (async () => {
      await this.#writeFileHandle(record);
      await this.#syncFileHandle();
    })();
    try {
      await waitForDeadline(startOperation, deadlineMs);
      this.#runStartWritten = true;
      this.#sequence += 1;
      this.#state = 'recording';
    } catch (error) {
      this.#state = 'disabled';
      if (error instanceof Error && error.message === 'deadline_expired') {
        this.#scheduleJsonlLateCleanup(startOperation);
      } else {
        await this.#releaseFileWithoutDeadline();
      }
      throw error;
    }
  }

  beginClose(deadlineMs: number = Date.now() + RUN_RECORDER_CLOSE_TIMEOUT_MS): void {
    if (this.#state === 'recording') {
      this.#state = 'closing';
      void deadlineMs;
    }
  }

  enqueue(message: ClientMessage, context: RunRecorderContext): void {
    if (this.#state !== 'recording') {
      return;
    }

    this.#validReceived += 1;
    this.#byType[message.type] += 1;
    this.#sequence += 1;

    const activeCount = (this.#inFlight ? 1 : 0) + this.#queue.length;
    if (activeCount >= RUN_RECORDER_QUEUE_LIMIT) {
      this.#droppedBeforeQueue += 1;
      this.#closeState = 'incomplete_queue_limit';
      this.#discardPendingQueueAfterQueueLimit();
      this.#state = 'disabled';
      return;
    }

    const record: RunRecord = {
      format: 'vio-run',
      format_version: 1,
      record_type: 'client_message',
      run_id: this.#runId,
      sequence: this.#sequence,
      server_time_ms: Date.now(),
      context: {
        client_id: context.clientId,
        device: context.device,
        received_at_ms: context.receivedAtMs,
      },
      message,
    };

    this.#queue.push(record);
    this.#queuedRecords += 1;
    this.#startPump();
  }

  close(
    deadlineMs: number = Date.now() + RUN_RECORDER_CLOSE_TIMEOUT_MS,
  ): Promise<RunRecorderCloseResult> {
    if (this.#closePromise) {
      return this.#closePromise;
    }
    this.#closePromise = this.#performClose(deadlineMs);
    return this.#closePromise;
  }

  async #performClose(deadlineMs: number): Promise<RunRecorderCloseResult> {
    if (this.#state === 'closed') {
      return this.#closeResult(this.#closeState ?? 'run_end_not_written');
    }
    if (this.#state === 'disabled' && !this.#file) {
      return this.#closeResult('run_end_not_written');
    }

    this.beginClose(deadlineMs);

    if (Date.now() >= deadlineMs) {
      this.#state = 'closing_timeout';
      this.#closeState = 'incomplete_close_timeout';
      this.#discardPendingRecords();
      this.#scheduleLateCleanup();
      return this.#closeResult('incomplete_close_timeout');
    }

    try {
      await waitForDeadline(this.#drain(), deadlineMs);
    } catch {
      this.#state = 'closing_timeout';
      this.#closeState = 'incomplete_close_timeout';
      this.#discardPendingRecords();
      this.#scheduleLateCleanup();
      return this.#closeResult('incomplete_close_timeout');
    }

    if (this.#closeState !== null) {
      await this.#writeRunEnd(this.#closeState, deadlineMs);
    } else if (this.getStats().droppedRecords > 0 || this.#writeErrors > 0) {
      const status =
        this.getStats().droppedRecords > 0 ? 'incomplete_queue_limit' : 'incomplete_write_error';
      await this.#writeRunEnd(status, deadlineMs);
    } else {
      await this.#writeRunEnd('complete_pending_close', deadlineMs);
    }

    if (!this.#runEndWritten) {
      if (this.#closeState === 'incomplete_close_timeout') {
        return this.#closeResult('incomplete_close_timeout');
      }
      await this.#closeJsonl(deadlineMs);
      return this.#closeResult('run_end_not_written');
    }
    if (this.#closeState !== null && this.#closeState !== 'complete_pending_close') {
      await this.#closeJsonl(deadlineMs);
      return this.#closeResult(this.#closeState);
    }

    const jsonlClosed = await this.#closeJsonl(deadlineMs);
    if (!jsonlClosed) {
      return this.#closeResult(this.#closeState ?? 'incomplete_close_error');
    }

    const manifestPublished = await this.#publishManifest(deadlineMs);
    if (!manifestPublished) {
      return this.#closeResult(this.#closeState ?? 'incomplete_manifest_error');
    }

    this.#manifestPublished = true;
    this.#closeState = 'complete';
    this.#state = 'closed';
    return this.#closeResult('complete');
  }

  #closeResult(status: RunCompletionStatus | 'run_end_not_written'): RunRecorderCloseResult {
    return {
      status,
      runEndWritten: this.#runEndWritten,
      manifestPublished: this.#manifestPublished,
      stats: this.getStats(),
    };
  }

  async #drain(): Promise<void> {
    if (this.#pumpPromise) {
      await this.#pumpPromise;
    }
  }

  #startPump(): void {
    if (this.#pumpPromise) {
      return;
    }
    this.#pumpPromise = this.#pump().finally(() => {
      this.#pumpPromise = null;
    });
  }

  async #pump(): Promise<void> {
    while (
      this.#queue.length > 0 &&
      this.#file &&
      (this.#state === 'recording' || this.#state === 'closing')
    ) {
      const record = this.#queue.shift();
      if (!record) {
        break;
      }

      this.#inFlight = true;
      try {
        await this.#writeFileHandle(record);
        this.#writtenRecords += 1;
      } catch {
        this.#writeErrors += 1;
        this.#droppedAfterQueue += 1;
        const remainingPending = this.#queue.length;
        this.#droppedAfterQueue += remainingPending;
        this.#queue = [];
        this.#closeState = 'incomplete_write_error';
        this.#state = 'disabled';
        break;
      } finally {
        this.#inFlight = false;
      }
    }
  }

  async #writeRunEnd(status: RunCompletionStatus, deadlineMs: number): Promise<void> {
    if (!this.#file || Date.now() >= deadlineMs) {
      return;
    }

    this.#sequence += 1;
    const serverTimeMs = Date.now();
    const durationMs = this.#startedAtMs > 0 ? serverTimeMs - this.#startedAtMs : 0;
    const record: RunRecord = {
      format: 'vio-run',
      format_version: 1,
      record_type: 'run_end',
      run_id: this.#runId,
      sequence: this.#sequence,
      server_time_ms: serverTimeMs,
      metadata: {
        ended_at_ms: serverTimeMs,
        duration_ms: durationMs,
        reason: 'server_shutdown',
        status,
        ingest: {
          messages_valid: this.#validReceived,
          messages_invalid: 'not_reported',
          by_type: { ...this.#byType },
        },
        recording: {
          valid_received: this.#validReceived,
          queued_records: this.#queuedRecords,
          dropped_before_queue: this.#droppedBeforeQueue,
          dropped_after_queue: this.#droppedAfterQueue,
          dropped_records: this.getStats().droppedRecords,
          written_records: this.#writtenRecords,
          write_errors: this.#writeErrors,
          run_start_written: this.#runStartWritten,
          run_end_written: false,
        },
      },
    };

    const runEndOperation = (async () => {
      await this.#writeFileHandle(record);
      await this.#syncFileHandle();
    })();
    try {
      await waitForDeadline(runEndOperation, deadlineMs);
      this.#runEndWritten = true;
    } catch (error) {
      if (error instanceof Error && error.message === 'deadline_expired') {
        this.#closeState = 'incomplete_close_timeout';
        this.#scheduleJsonlLateCleanup(runEndOperation);
      } else {
        this.#writeErrors += 1;
        this.#closeState = status === 'complete_pending_close' ? 'incomplete_write_error' : status;
      }
    }
  }

  async #closeJsonl(deadlineMs: number): Promise<boolean> {
    if (this.#jsonlClosePromise) {
      return this.#jsonlClosePromise;
    }
    if (!this.#file) {
      return true;
    }
    if (Date.now() >= deadlineMs) {
      this.#closeState = 'incomplete_close_timeout';
      return false;
    }

    const file = this.#file;
    const closeOperation = this.#adapter.close(file);
    this.#jsonlClosePromise = (async () => {
      try {
        await waitForDeadline(closeOperation, deadlineMs);
        if (this.#file === file) {
          this.#file = null;
        }
        return true;
      } catch {
        void closeOperation
          .then(() => {
            if (this.#file === file) {
              this.#file = null;
            }
          })
          .catch(() => undefined);
        this.#closeState =
          this.#closeState === 'incomplete_close_timeout'
            ? 'incomplete_close_timeout'
            : 'incomplete_close_error';
        return false;
      }
    })();
    return this.#jsonlClosePromise;
  }

  async #publishManifest(deadlineMs: number): Promise<boolean> {
    if (
      this.#droppedBeforeQueue > 0 ||
      this.#droppedAfterQueue > 0 ||
      this.#writeErrors > 0 ||
      !this.#runEndWritten ||
      this.#validReceived !== this.#queuedRecords + this.#droppedBeforeQueue ||
      this.#queuedRecords !== this.#writtenRecords + this.#droppedAfterQueue
    ) {
      this.#closeState = 'incomplete_write_error';
      return false;
    }
    if (Date.now() >= deadlineMs) {
      this.#closeState = 'incomplete_close_timeout';
      return false;
    }

    const endedAtMs = Date.now();
    const manifest = {
      format: 'vio-run-manifest',
      format_version: 1,
      run_id: this.#runId,
      jsonl_file: `${this.#runId}.jsonl`,
      status: 'complete',
      started_at_ms: this.#startedAtMs,
      ended_at_ms: endedAtMs,
      duration_ms: this.#startedAtMs > 0 ? endedAtMs - this.#startedAtMs : 0,
      reason: 'server_shutdown',
      ingest: {
        messages_valid: this.#validReceived,
        messages_invalid: 'not_reported',
        by_type: { ...this.#byType },
      },
      recording: {
        valid_received: this.#validReceived,
        queued_records: this.#queuedRecords,
        dropped_before_queue: this.#droppedBeforeQueue,
        dropped_after_queue: this.#droppedAfterQueue,
        dropped_records: this.getStats().droppedRecords,
        written_records: this.#writtenRecords,
        write_errors: this.#writeErrors,
        run_start_written: this.#runStartWritten,
        run_end_written: this.#runEndWritten,
        jsonl_closed: true,
        last_sequence: this.#sequence,
      },
    };

    if (!validateRunManifest(manifest, this.#runId, `${this.#runId}.jsonl`)) {
      this.#closeState = 'incomplete_manifest_error';
      return false;
    }

    try {
      await this.#adapter.mkdir(dirname(this.#manifestTempPath));
    } catch {
      this.#closeState = 'incomplete_manifest_error';
      return false;
    }

    const openOperation = this.#adapter.open(this.#manifestTempPath, 'wx');
    try {
      this.#tempHandle = await waitForDeadline(openOperation, deadlineMs);
    } catch (error) {
      if (error instanceof Error && error.message === 'deadline_expired') {
        void openOperation
          .then((handle) => {
            this.#tempHandle = handle;
            void this.#closeTempHandleLate(handle);
          })
          .catch(() => undefined);
        this.#closeState = 'incomplete_close_timeout';
      } else {
        this.#closeState = 'incomplete_manifest_error';
      }
      return false;
    }

    const tempHandle = this.#tempHandle;
    if (!tempHandle) {
      this.#closeState = 'incomplete_manifest_error';
      return false;
    }

    const writeSyncOperation = (async () => {
      await this.#adapter.write(tempHandle, `${JSON.stringify(manifest)}\n`);
      await this.#adapter.sync(tempHandle);
    })();
    try {
      await waitForDeadline(writeSyncOperation, deadlineMs);
    } catch (error) {
      if (error instanceof Error && error.message === 'deadline_expired') {
        void this.#closeTempHandleLate(tempHandle, writeSyncOperation);
        this.#closeState = 'incomplete_close_timeout';
      } else {
        await this.#closeTempHandleLate(tempHandle);
        this.#closeState = 'incomplete_manifest_error';
      }
      return false;
    }

    const closeOperation = this.#adapter.close(tempHandle);
    this.#tempClosePromise = (async () => {
      try {
        await closeOperation;
      } catch {
        // El temporal queda sin publicar.
      }
    })();
    try {
      await waitForDeadline(closeOperation, deadlineMs);
    } catch (error) {
      if (error instanceof Error && error.message === 'deadline_expired') {
        void closeOperation.catch(() => undefined);
        this.#closeState = 'incomplete_close_timeout';
      } else {
        this.#closeState = 'incomplete_manifest_error';
        return false;
      }
      return false;
    }
    this.#tempHandle = null;

    try {
      await waitForDeadline(
        this.#adapter.rename(this.#manifestTempPath, this.#manifestPath),
        deadlineMs,
      );
      return true;
    } catch (error) {
      this.#closeState =
        error instanceof Error && error.message === 'deadline_expired'
          ? 'incomplete_close_timeout'
          : 'incomplete_manifest_error';
      return false;
    }
  }

  async #writeFileHandle(record: RunRecord): Promise<void> {
    if (!this.#file) {
      throw new Error('El archivo del grabador no está abierto');
    }
    await this.#adapter.write(this.#file, `${JSON.stringify(record)}\n`);
  }

  async #syncFileHandle(): Promise<void> {
    if (!this.#file) {
      throw new Error('El archivo del grabador no está abierto');
    }
    await this.#adapter.sync(this.#file);
  }

  #cameraCalibrationMetadata(): unknown {
    if (!this.#options.cameraCalibration) {
      return {
        available: false,
        source: 'not_reported',
        calibration: null,
        error: this.#options.cameraCalibrationError ?? null,
      };
    }
    return {
      available: true,
      source: this.#options.cameraCalibrationSource ?? 'camera_intrinsics',
      calibration: this.#options.cameraCalibration,
      error: null,
    };
  }

  #discardPendingQueueAfterQueueLimit(): void {
    const pending = this.#queue.length;
    this.#droppedAfterQueue += pending;
    this.#queue = [];
  }

  #discardPendingRecords(): void {
    const pending = this.#queue.length;
    this.#droppedAfterQueue += pending;
    this.#queue = [];
  }

  #scheduleLateCleanup(): void {
    if (this.#lateCleanupPromise) {
      return;
    }
    this.#lateCleanupPromise = (async () => {
      if (this.#pumpPromise) {
        try {
          await this.#pumpPromise;
        } catch {
          // La escritura tardía ya será representada por el estado de timeout.
        }
      }
      await this.#closeJsonlAsCleanup();
    })();
  }

  #scheduleJsonlLateCleanup(operation: Promise<void>): void {
    if (this.#lateCleanupPromise) {
      return;
    }
    this.#lateCleanupPromise = (async () => {
      try {
        await operation;
      } catch {
        // La operación ya falló; no se intenta escribir ni publicar.
      }
      await this.#closeJsonlAsCleanup();
    })();
  }

  async #closeJsonlAsCleanup(): Promise<void> {
    if (!this.#file) {
      return;
    }
    if (this.#jsonlClosePromise) {
      await this.#jsonlClosePromise.catch(() => undefined);
      return;
    }

    const file = this.#file;
    this.#jsonlClosePromise = (async () => {
      try {
        await this.#adapter.close(file);
        if (this.#file === file) {
          this.#file = null;
        }
        return true;
      } catch {
        return false;
      }
    })();
    await this.#jsonlClosePromise;
  }

  async #releaseHandleQuietly(handle: unknown): Promise<void> {
    try {
      await this.#adapter.close(handle);
    } catch {
      // El recurso ya falló y no puede alterarse la telemetría.
    }
  }

  async #releaseFileWithoutDeadline(): Promise<void> {
    const file = this.#file;
    this.#file = null;
    if (file) {
      await this.#releaseHandleQuietly(file);
    }
  }

  async #closeTempHandleLate(handle: unknown, pendingOperation?: Promise<void>): Promise<void> {
    if (pendingOperation) {
      try {
        await pendingOperation;
      } catch {
        // No se publicará el manifiesto.
      }
    }
    if (this.#tempClosePromise) {
      await this.#tempClosePromise.catch(() => undefined);
      return;
    }
    this.#tempClosePromise = (async () => {
      try {
        await this.#adapter.close(handle);
      } catch {
        // El descriptor temporal no puede cerrarse después de un fallo.
      }
    })();
    await this.#tempClosePromise;
    if (this.#tempHandle === handle) {
      this.#tempHandle = null;
    }
  }

  get droppedRecords(): number {
    return this.#droppedBeforeQueue + this.#droppedAfterQueue;
  }
}

async function waitForDeadline<T>(promise: Promise<T>, deadlineMs: number): Promise<T> {
  const remainingMs = deadlineMs - Date.now();
  if (remainingMs <= 0) {
    throw new Error('deadline_expired');
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('deadline_expired')), remainingMs);
  });

  try {
    return await Promise.race([promise, deadline]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
