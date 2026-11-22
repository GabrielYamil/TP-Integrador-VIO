import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CameraCalibration, MarkerMap } from '@vio/shared';
import { describe, expect, it, vi } from 'vitest';
import type { RunRecorderFileAdapter } from './run-recorder';
import { RUN_RECORDER_QUEUE_LIMIT, RunRecorder, validateRunManifest } from './run-recorder';

const markerMap: MarkerMap = {
  frame_id: 'world',
  dictionary: 'APRILTAG_36h11',
  markers: [
    {
      id: 0,
      size_m: 0.16,
      position: [3, 0, 1.2],
      orientation_xyzw: [0, 0.707107, 0.707107, 0],
    },
  ],
};

class MemoryAdapter implements RunRecorderFileAdapter {
  readonly files = new Map<string, string>();
  readonly dirs = new Set<string>();
  readonly closePaths: string[] = [];
  closeCalls = 0;
  readonly writeCalls: string[] = [];
  writeErrorAt: string | null = null;
  closeErrorAt: string | null = null;
  renameError = false;

  async mkdir(path: string): Promise<void> {
    this.dirs.add(path);
  }

  async open(path: string, flags: 'wx'): Promise<unknown> {
    if (flags === 'wx' && this.files.has(path)) {
      throw new Error(`archivo existente: ${path}`);
    }
    this.files.set(path, '');
    return { path };
  }

  async write(handle: unknown, text: string): Promise<void> {
    const path = (handle as { path: string }).path;
    this.writeCalls.push(path);
    if (this.writeErrorAt === path) {
      throw new Error(`error de escritura: ${path}`);
    }
    this.files.set(path, (this.files.get(path) ?? '') + text);
  }

  async sync(_handle: unknown): Promise<void> {}

  async close(handle: unknown): Promise<void> {
    const path = (handle as { path: string }).path;
    this.closeCalls += 1;
    this.closePaths.push(path);
    if (this.closeErrorAt === path) {
      throw new Error(`error de cierre: ${path}`);
    }
  }

  async rename(from: string, to: string): Promise<void> {
    if (this.renameError) {
      throw new Error('error de renombrado');
    }
    const content = this.files.get(from);
    if (content === undefined) {
      throw new Error(`archivo temporal inexistente: ${from}`);
    }
    this.files.delete(from);
    this.files.set(to, content);
  }
}

function createRecorder(
  runsDir: string,
  adapter: RunRecorderFileAdapter,
  cameraCalibration: CameraCalibration | null = null,
) {
  return new RunRecorder({
    runsDir,
    server: {
      name: 'vio-marker-fusion',
      version: '0.1.0',
      tls: false,
      httpHost: '127.0.0.1',
      httpPort: 8443,
      ingestPath: '/ingest',
      foxgloveHost: '127.0.0.1',
      foxglovePort: 8765,
    },
    markerMap,
    markerMapSource: 'config/marker_map.json',
    cameraCalibration,
    cameraCalibrationSource: cameraCalibration ? 'config/camera_intrinsics.json' : 'not_reported',
    fileAdapter: adapter,
  });
}

function parseLines(adapter: MemoryAdapter, jsonlPath: string): Record<string, unknown>[] {
  const text = adapter.files.get(jsonlPath);
  if (!text) {
    return [];
  }
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('RunRecorder', () => {
  it('writes run_start, valid messages, run_end and a complete manifest', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'vio-run-recorder-'));
    const runsDir = join(tempDir, 'runs');
    const adapter = new MemoryAdapter();
    const recorder = createRecorder(runsDir, adapter);

    try {
      await recorder.initialize(Date.now() + 1000);
      recorder.enqueue(
        {
          type: 'hello',
          device: 'sim-client',
          intrinsics: { fx: 500, fy: 500, cx: 320, cy: 240 },
          image_size: [640, 480],
        },
        { clientId: 1, device: 'sim-client', receivedAtMs: 1001 },
      );
      recorder.enqueue(
        {
          type: 'pose',
          t: 1000,
          raw: { p: [1, 2, 3], q: [0, 0, 0, 1] },
          corrected: { p: [1.1, 2.1, 3.1], q: [0, 0, 0, 1] },
          tracking: 'tracking',
        },
        { clientId: 1, device: 'sim-client', receivedAtMs: 1002 },
      );

      const close = await recorder.close(Date.now() + 1000);
      expect(close.status).toBe('complete');
      expect(close.runEndWritten).toBe(true);
      expect(close.manifestPublished).toBe(true);
      expect(close.stats.validReceived).toBe(2);
      expect(close.stats.droppedRecords).toBe(0);
      expect(close.stats.writeErrors).toBe(0);

      const lines = parseLines(adapter, recorder.filePath);
      expect(lines[0]?.record_type).toBe('run_start');
      expect(lines.at(-1)?.record_type).toBe('run_end');
      const runEndMetadata = lines.at(-1)?.metadata as
        | {
            duration_ms?: number;
          }
        | undefined;
      expect(runEndMetadata?.duration_ms).toBeTypeOf('number');

      expect(adapter.files.has(recorder.manifestPath)).toBe(true);
      const manifest = JSON.parse(adapter.files.get(recorder.manifestPath)!) as {
        run_id: string;
        jsonl_file: string;
        status: string;
        recording: Record<string, unknown>;
      };
      expect(manifest.run_id).toBe(recorder.runId);
      expect(manifest.jsonl_file).toBe(`${recorder.runId}.jsonl`);
      expect(manifest.status).toBe('complete');
      expect(manifest.recording.run_start_written).toBe(true);
      expect(manifest.recording.run_end_written).toBe(true);
      expect(manifest.recording.jsonl_closed).toBe(true);
      const secondClose = await recorder.close(Date.now() + 1000);
      expect(secondClose.status).toBe('complete');
      expect(adapter.closePaths.filter((path) => path === recorder.filePath)).toHaveLength(1);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('copies a validated camera calibration into run_start', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'vio-run-calibration-'));
    const adapter = new MemoryAdapter();
    const recorder = createRecorder(join(tempDir, 'runs'), adapter, {
      image_size: [1920, 1080],
      intrinsics: { fx: 1500, fy: 1500, cx: 960, cy: 540 },
    });

    try {
      await recorder.initialize(Date.now() + 1000);
      await recorder.close(Date.now() + 1000);
      const lines = parseLines(adapter, recorder.filePath);
      const start = lines[0] as {
        metadata: {
          camera_calibration: {
            available: boolean;
            calibration: unknown;
          };
        };
      };
      expect(start.metadata.camera_calibration.available).toBe(true);
      expect(start.metadata.camera_calibration.calibration).toEqual({
        image_size: [1920, 1080],
        intrinsics: { fx: 1500, fy: 1500, cx: 960, cy: 540 },
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('closes run_start late when initialization write times out', async () => {
    vi.useFakeTimers();
    try {
      const tempDir = await mkdtemp(join(tmpdir(), 'vio-run-start-timeout-'));
      const adapter = new MemoryAdapter();
      let resolveWrite: (() => void) | null = null;
      const originalWrite = adapter.write.bind(adapter);
      adapter.write = vi.fn(async (handle: unknown, text: string) => {
        if (text.includes('"record_type":"run_start"')) {
          await new Promise<void>((resolve) => {
            resolveWrite = resolve;
          });
          return;
        }
        await originalWrite(handle, text);
      });
      const recorder = createRecorder(join(tempDir, 'runs'), adapter);

      const initializePromise = recorder.initialize(Date.now() + 50);
      void initializePromise.catch(() => undefined);
      await vi.advanceTimersByTimeAsync(50);
      await expect(initializePromise).rejects.toThrow('deadline_expired');
      expect(recorder.getStats().runStartWritten).toBe(false);
      expect(recorder.getStats().state).toBe('disabled');
      expect(adapter.closePaths).toHaveLength(0);

      const releaseWrite = resolveWrite as (() => void) | null;
      expect(releaseWrite).not.toBeNull();
      releaseWrite?.();
      await Promise.resolve();
      await Promise.resolve();
      await vi.runAllTimersAsync();

      expect(adapter.closePaths.filter((path) => path === recorder.filePath)).toHaveLength(1);
      await rm(tempDir, { recursive: true, force: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes run_end late when synchronization times out', async () => {
    vi.useFakeTimers();
    try {
      const tempDir = await mkdtemp(join(tmpdir(), 'vio-run-end-sync-'));
      const adapter = new MemoryAdapter();
      const recorder = createRecorder(join(tempDir, 'runs'), adapter);
      await recorder.initialize(Date.now() + 1000);

      let resolveSync: (() => void) | null = null;
      adapter.sync = vi.fn(async (handle: unknown) => {
        const path = (handle as { path: string }).path;
        if (path === recorder.filePath) {
          await new Promise<void>((resolve) => {
            resolveSync = resolve;
          });
        }
      });

      const closePromise = recorder.close(Date.now() + 50);
      await vi.advanceTimersByTimeAsync(50);
      const close = await closePromise;

      expect(close.status).toBe('incomplete_close_timeout');
      expect(close.runEndWritten).toBe(false);
      expect(close.manifestPublished).toBe(false);
      expect(adapter.closePaths.filter((path) => path === recorder.filePath)).toHaveLength(0);

      const releaseSync = resolveSync as (() => void) | null;
      releaseSync?.();
      await Promise.resolve();
      await vi.runAllTimersAsync();

      expect(adapter.closePaths.filter((path) => path === recorder.filePath)).toHaveLength(1);
      await rm(tempDir, { recursive: true, force: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not write or close run_end concurrently when it times out', async () => {
    vi.useFakeTimers();
    try {
      const tempDir = await mkdtemp(join(tmpdir(), 'vio-run-end-timeout-'));
      const adapter = new MemoryAdapter();
      const originalWrite = adapter.write.bind(adapter);
      let resolveRunEnd: (() => void) | null = null;
      adapter.write = vi.fn(async (handle: unknown, text: string) => {
        if (text.includes('"record_type":"run_end"')) {
          await new Promise<void>((resolve) => {
            resolveRunEnd = resolve;
          });
          return;
        }
        await originalWrite(handle, text);
      });
      const recorder = createRecorder(join(tempDir, 'runs'), adapter);
      await recorder.initialize(Date.now() + 1000);

      const closePromise = recorder.close(Date.now() + 50);
      await vi.advanceTimersByTimeAsync(50);
      const close = await closePromise;
      expect(close.status).toBe('incomplete_close_timeout');
      expect(close.runEndWritten).toBe(false);
      expect(close.manifestPublished).toBe(false);
      expect(resolveRunEnd).not.toBeNull();
      expect(adapter.closePaths.filter((path) => path === recorder.filePath)).toHaveLength(0);

      const releaseRunEnd = resolveRunEnd as (() => void) | null;
      releaseRunEnd?.();
      await Promise.resolve();
      await Promise.resolve();
      await vi.runAllTimersAsync();

      expect(adapter.closePaths.filter((path) => path === recorder.filePath)).toHaveLength(1);
      await rm(tempDir, { recursive: true, force: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not publish or close the manifest temporaries concurrently on timeout', async () => {
    vi.useFakeTimers();
    try {
      const tempDir = await mkdtemp(join(tmpdir(), 'vio-run-manifest-timeout-'));
      const adapter = new MemoryAdapter();
      const originalWrite = adapter.write.bind(adapter);
      let resolveManifestWrite: (() => void) | null = null;
      adapter.write = vi.fn(async (handle: unknown, text: string) => {
        if (text.includes('"format":"vio-run-manifest"')) {
          await new Promise<void>((resolve) => {
            resolveManifestWrite = resolve;
          });
          return;
        }
        await originalWrite(handle, text);
      });
      const recorder = createRecorder(join(tempDir, 'runs'), adapter);
      await recorder.initialize(Date.now() + 1000);

      const closePromise = recorder.close(Date.now() + 50);
      await vi.advanceTimersByTimeAsync(50);
      const close = await closePromise;

      expect(close.status).toBe('incomplete_close_timeout');
      expect(close.manifestPublished).toBe(false);
      expect(adapter.files.has(recorder.manifestPath)).toBe(false);
      expect(resolveManifestWrite).not.toBeNull();

      const tempPath = `${recorder.manifestPath}.tmp`;
      const tempClosedBeforeResolution = adapter.closePaths.filter((path) =>
        path.includes('.manifest.json.tmp'),
      ).length;
      expect(tempClosedBeforeResolution).toBe(0);

      const releaseManifest = resolveManifestWrite as (() => void) | null;
      releaseManifest?.();
      await Promise.resolve();
      await Promise.resolve();
      await vi.runAllTimersAsync();

      expect(adapter.closePaths.filter((path) => path === tempPath)).toHaveLength(1);
      expect(adapter.files.has(recorder.manifestPath)).toBe(false);
      await rm(tempDir, { recursive: true, force: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('counts a write failure only as droppedAfterQueue', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'vio-run-write-error-'));
    const adapter = new MemoryAdapter();
    const recorder = createRecorder(join(tempDir, 'runs'), adapter);

    try {
      await recorder.initialize(Date.now() + 1000);
      adapter.writeErrorAt = recorder.filePath;
      recorder.enqueue(
        {
          type: 'pose',
          t: 1000,
          raw: { p: [0, 0, 1], q: [0, 0, 0, 1] },
          tracking: 'tracking',
        },
        { clientId: 1, device: 'sim-client', receivedAtMs: 1001 },
      );

      const close = await recorder.close(Date.now() + 1000);
      expect(close.stats.validReceived).toBe(1);
      expect(close.stats.queuedRecords).toBe(1);
      expect(close.stats.droppedBeforeQueue).toBe(0);
      expect(close.stats.droppedAfterQueue).toBe(1);
      expect(close.stats.droppedRecords).toBe(1);
      expect(close.stats.writtenRecords).toBe(0);
      expect(close.stats.writeErrors).toBe(2);
      expect(close.manifestPublished).toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('does not count inFlight as dropped when the deadline expires', async () => {
    vi.useFakeTimers();
    try {
      const tempDir = await mkdtemp(join(tmpdir(), 'vio-run-deadline-'));
      let resolveWrite: (() => void) | null = null;
      const adapter = new MemoryAdapter();
      const originalWrite = adapter.write.bind(adapter);
      adapter.write = vi.fn(async (handle: unknown, text: string) => {
        if (text.includes('"record_type":"client_message"')) {
          await new Promise<void>((resolve) => {
            resolveWrite = resolve;
          });
          return;
        }
        await originalWrite(handle, text);
      });
      const recorder = createRecorder(join(tempDir, 'runs'), adapter);
      await recorder.initialize(Date.now() + 1000);
      recorder.enqueue(
        {
          type: 'pose',
          t: 1000,
          raw: { p: [0, 0, 1], q: [0, 0, 0, 1] },
          tracking: 'tracking',
        },
        { clientId: 1, device: 'sim-client', receivedAtMs: 1001 },
      );

      const closePromise = recorder.close(Date.now() + 50);
      await vi.advanceTimersByTimeAsync(50);
      const close = await closePromise;

      expect(close.status).toBe('incomplete_close_timeout');
      expect(close.stats.droppedRecords).toBe(0);
      expect(close.stats.writtenRecords).toBe(0);
      expect(close.manifestPublished).toBe(false);
      expect(resolveWrite).not.toBeNull();
      expect(adapter.closeCalls).toBe(0);

      const releaseWrite = resolveWrite as (() => void) | null;
      if (releaseWrite) {
        releaseWrite();
      }
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await vi.runAllTimersAsync();

      expect(adapter.closeCalls).toBe(1);
      expect(recorder.getStats().activeQueueRecords).toBe(0);
      await rm(tempDir, { recursive: true, force: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports an overflow with droppedBeforeQueue and droppedAfterQueue', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'vio-run-limit-'));
    let resolveWrite: (() => void) | null = null;
    const adapter = new MemoryAdapter();
    const originalWrite = adapter.write.bind(adapter);
    adapter.write = vi.fn(async (handle: unknown, text: string) => {
      if (text.includes('"record_type":"client_message"')) {
        await new Promise<void>((resolve) => {
          resolveWrite = resolve;
        });
        return;
      }
      await originalWrite(handle, text);
    });
    const recorder = createRecorder(join(tempDir, 'runs'), adapter);

    try {
      await recorder.initialize(Date.now() + 1000);

      for (let index = 0; index < RUN_RECORDER_QUEUE_LIMIT + 1; index += 1) {
        recorder.enqueue(
          {
            type: 'pose',
            t: index,
            raw: { p: [0, 0, 1], q: [0, 0, 0, 1] },
            tracking: 'tracking',
          },
          { clientId: 1, device: 'sim-client', receivedAtMs: index + 1 },
        );
      }

      const stats = recorder.getStats();
      expect(stats.droppedBeforeQueue).toBe(1);
      expect(resolveWrite).not.toBeNull();
      const releaseWrite = resolveWrite as (() => void) | null;
      if (releaseWrite) {
        releaseWrite();
      }
      adapter.write = originalWrite;

      const validBeforeFuturePose = recorder.getStats().validReceived;
      recorder.enqueue(
        {
          type: 'pose',
          t: -1,
          raw: { p: [0, 0, 1], q: [0, 0, 0, 1] },
          tracking: 'tracking',
        },
        { clientId: 1, device: 'sim-client', receivedAtMs: -1 },
      );
      expect(recorder.getStats().validReceived).toBe(validBeforeFuturePose);

      const close = await recorder.close(Date.now() + 1000);
      expect(close.status).toBe('incomplete_queue_limit');
      expect(close.stats.validReceived).toBe(RUN_RECORDER_QUEUE_LIMIT + 1);
      expect(close.stats.queuedRecords).toBe(RUN_RECORDER_QUEUE_LIMIT);
      expect(close.stats.droppedBeforeQueue).toBe(1);
      expect(close.stats.droppedAfterQueue).toBe(RUN_RECORDER_QUEUE_LIMIT - 1);
      expect(close.stats.droppedRecords).toBe(RUN_RECORDER_QUEUE_LIMIT);
      expect(close.manifestPublished).toBe(false);
      if (close.runEndWritten) {
        const lines = parseLines(adapter, recorder.filePath);
        const sequences = lines
          .map((line) => line.sequence)
          .filter((value): value is number => typeof value === 'number');
        expect(new Set(sequences).size).toBe(sequences.length);
        const runEnd = lines.find((line) => line.record_type === 'run_end');
        expect(runEnd?.sequence).toBe(RUN_RECORDER_QUEUE_LIMIT + 3);
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('does not publish a manifest after a rename error', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'vio-run-rename-'));
    const adapter = new MemoryAdapter();
    adapter.renameError = true;
    const recorder = createRecorder(join(tempDir, 'runs'), adapter);

    try {
      await recorder.initialize(Date.now() + 1000);
      await recorder.close(Date.now() + 1000);
      const stats = recorder.getStats();
      expect(stats.runEndWritten).toBe(true);
      expect(stats.state).not.toBe('closed');
      expect(adapter.files.has(recorder.manifestPath)).toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('does not publish a manifest after an error closing the JSONL', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'vio-run-close-error-'));
    const adapter = new MemoryAdapter();
    const recorder = createRecorder(join(tempDir, 'runs'), adapter);

    try {
      await recorder.initialize(Date.now() + 1000);
      adapter.closeErrorAt = recorder.filePath;
      const close = await recorder.close(Date.now() + 1000);
      expect(close.status).toBe('incomplete_close_error');
      expect(close.runEndWritten).toBe(true);
      expect(close.manifestPublished).toBe(false);
      expect(adapter.files.has(recorder.manifestPath)).toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects a manifest whose run_id does not match the JSONL', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'vio-run-manifest-id-'));
    const adapter = new MemoryAdapter();
    const recorder = createRecorder(join(tempDir, 'runs'), adapter);

    try {
      await recorder.initialize(Date.now() + 1000);
      await recorder.close(Date.now() + 1000);
      const manifestText = adapter.files.get(recorder.manifestPath);
      expect(manifestText).toBeDefined();
      const manifest = JSON.parse(manifestText!) as { run_id: string; jsonl_file: string };
      expect(manifest.run_id).toBe(recorder.runId);
      expect(manifest.jsonl_file).toBe(`${recorder.runId}.jsonl`);
      expect(validateRunManifest(manifest, recorder.runId, `${recorder.runId}.jsonl`)).toBe(true);
      manifest.run_id = 'incorrect-run-id';
      expect(validateRunManifest(manifest, recorder.runId, `${recorder.runId}.jsonl`)).toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects manifests with missing or inconsistent recording counters', () => {
    const base = {
      format: 'vio-run-manifest',
      format_version: 1,
      run_id: 'run-1',
      jsonl_file: 'run-1.jsonl',
      status: 'complete',
      recording: {
        valid_received: 3,
        queued_records: 3,
        dropped_before_queue: 0,
        dropped_after_queue: 0,
        dropped_records: 0,
        written_records: 3,
        write_errors: 0,
        last_sequence: 4,
        run_start_written: true,
        run_end_written: true,
        jsonl_closed: true,
      },
    };

    expect(validateRunManifest(base, 'run-1', 'run-1.jsonl')).toBe(true);
    expect(validateRunManifest({ ...base, recording: undefined }, 'run-1', 'run-1.jsonl')).toBe(
      false,
    );
    expect(
      validateRunManifest(
        {
          ...base,
          recording: { ...base.recording, valid_received: -1 },
        },
        'run-1',
        'run-1.jsonl',
      ),
    ).toBe(false);
    expect(
      validateRunManifest(
        {
          ...base,
          recording: { ...base.recording, dropped_before_queue: 1, valid_received: 3 },
        },
        'run-1',
        'run-1.jsonl',
      ),
    ).toBe(false);
  });

  it('does not create an active run if initialization fails', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'vio-run-init-'));
    const adapter = new MemoryAdapter();
    const recorder = createRecorder(join(tempDir, 'runs'), adapter);
    adapter.open = vi.fn(async () => {
      throw new Error('open failed');
    });

    try {
      await expect(recorder.initialize(Date.now() + 1000)).rejects.toBeDefined();
      expect(recorder.getStats().state).toBe('disabled');
      const close = await recorder.close(Date.now() + 1000);
      expect(close.runEndWritten).toBe(false);
      expect(close.manifestPublished).toBe(false);
      expect(close.status).toBe('run_end_not_written');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
