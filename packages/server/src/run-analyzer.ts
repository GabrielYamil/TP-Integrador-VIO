import { parseClientMessage } from '@vio/shared';
import type { ClientMessage, PoseMessagePayload } from '@vio/shared';

export interface RunCheckpoint {
  name: string;
  t: number;
  expected: [number, number, number];
}

export interface RunAnalysisOptions {
  markerVisibilityWindowMs?: number;
  checkpoints?: RunCheckpoint[];
}

export interface DistributionSummary {
  count: number;
  mean: number | null;
  p50: number | null;
  p95: number | null;
  max: number | null;
}

export interface TrajectoryRow {
  t: number;
  elapsed_s: number;
  raw_x: number;
  raw_y: number;
  raw_z: number;
  corrected_x: number | null;
  corrected_y: number | null;
  corrected_z: number | null;
  tracking: string;
  latency_ms: number;
  marker_visible: boolean;
}

export interface CheckpointResult {
  name: string;
  requested_t: number;
  matched_t: number;
  time_offset_ms: number;
  expected: [number, number, number];
  raw_error_m: number;
  corrected_error_m: number | null;
}

export interface RunAnalysis {
  run_id: string;
  duration_s: number;
  messages: {
    total: number;
    pose: number;
    marker: number;
    correction: number;
    hello: number;
  };
  update_rate_hz: number | null;
  closure_error_m: {
    raw: number | null;
    corrected: number | null;
  };
  latency_ms: DistributionSummary;
  tracking_percent: {
    tracking: number;
    limited: number;
    lost: number;
  };
  marker_visibility: {
    window_ms: number;
    visible_pose_samples: number;
    total_pose_samples: number;
    percent: number;
  };
  checkpoints: CheckpointResult[];
  trajectory: TrajectoryRow[];
}

interface RecordedMessage {
  runId: string;
  sequence: number;
  receivedAtMs: number;
  message: ClientMessage;
}

const DEFAULT_MARKER_VISIBILITY_WINDOW_MS = 250;

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Campo inválido: ${field}`);
  }
  return value;
}

function distance(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function percentile(sorted: readonly number[], ratio: number): number | null {
  if (sorted.length === 0) {
    return null;
  }
  const index = Math.ceil(ratio * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))] ?? null;
}

function distribution(values: readonly number[]): DistributionSummary {
  if (values.length === 0) {
    return { count: 0, mean: null, p50: null, p95: null, max: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: values.length,
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1) ?? null,
  };
}

function parseRecords(text: string): { runId: string; records: RecordedMessage[] } {
  const records: RecordedMessage[] = [];
  let runId: string | null = null;
  let previousSequence = -1;

  for (const [index, rawLine] of text.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`JSON inválido en la línea ${index + 1}`);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Registro inválido en la línea ${index + 1}`);
    }
    const record = value as Record<string, unknown>;
    if (record.format !== 'vio-run' || record.format_version !== 1) {
      throw new Error(`Formato de corrida no soportado en la línea ${index + 1}`);
    }
    if (typeof record.run_id !== 'string' || record.run_id.length === 0) {
      throw new Error(`run_id inválido en la línea ${index + 1}`);
    }
    runId ??= record.run_id;
    if (record.run_id !== runId) {
      throw new Error(`La línea ${index + 1} pertenece a otra corrida`);
    }
    const sequence = finiteNumber(record.sequence, `sequence (línea ${index + 1})`);
    if (!Number.isSafeInteger(sequence) || sequence <= previousSequence) {
      throw new Error(`Secuencia fuera de orden en la línea ${index + 1}`);
    }
    previousSequence = sequence;

    if (record.record_type !== 'client_message') {
      continue;
    }
    const parsed = parseClientMessage(record.message);
    if (!parsed.ok) {
      throw new Error(`Mensaje inválido en la línea ${index + 1}: ${parsed.error}`);
    }
    const context = record.context;
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
      throw new Error(`Contexto inválido en la línea ${index + 1}`);
    }
    const receivedAtMs = finiteNumber(
      (context as Record<string, unknown>).received_at_ms,
      `context.received_at_ms (línea ${index + 1})`,
    );
    records.push({ runId, sequence, receivedAtMs, message: parsed.message });
  }

  if (!runId) {
    throw new Error('La corrida está vacía');
  }
  return { runId, records };
}

function nearestPose(poses: readonly RecordedMessage[], t: number): RecordedMessage | null {
  let best: RecordedMessage | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const pose of poses) {
    const message = pose.message as PoseMessagePayload;
    const timeDistance = Math.abs(message.t - t);
    if (timeDistance < bestDistance) {
      best = pose;
      bestDistance = timeDistance;
    }
  }
  return best;
}

export function analyzeRunJsonl(text: string, options: RunAnalysisOptions = {}): RunAnalysis {
  const visibilityWindow = options.markerVisibilityWindowMs ?? DEFAULT_MARKER_VISIBILITY_WINDOW_MS;
  if (!Number.isFinite(visibilityWindow) || visibilityWindow < 0) {
    throw new Error('markerVisibilityWindowMs debe ser un número no negativo');
  }

  const parsedRun = parseRecords(text);
  const { records } = parsedRun;
  const poses = records
    .filter((record) => record.message.type === 'pose')
    .sort((a, b) => (a.message as PoseMessagePayload).t - (b.message as PoseMessagePayload).t);
  const markerTimes = records
    .flatMap((record) => (record.message.type === 'marker' ? [record.message.t] : []))
    .sort((a, b) => a - b);

  const firstPose = poses[0]?.message as PoseMessagePayload | undefined;
  const lastPose = poses.at(-1)?.message as PoseMessagePayload | undefined;
  const durationMs = firstPose && lastPose ? Math.max(0, lastPose.t - firstPose.t) : 0;
  const latencies = poses.map(
    (record) => record.receivedAtMs - (record.message as PoseMessagePayload).t,
  );

  let markerIndex = 0;
  let latestMarkerTime = Number.NEGATIVE_INFINITY;
  let visibleSamples = 0;
  const trackingCounts = { tracking: 0, limited: 0, lost: 0 };
  const trajectory = poses.map((record): TrajectoryRow => {
    const message = record.message as PoseMessagePayload;
    while (
      markerIndex < markerTimes.length &&
      (markerTimes[markerIndex] ?? Infinity) <= message.t
    ) {
      latestMarkerTime = markerTimes[markerIndex] ?? latestMarkerTime;
      markerIndex += 1;
    }
    const markerVisible = message.t - latestMarkerTime <= visibilityWindow;
    if (markerVisible) {
      visibleSamples += 1;
    }
    trackingCounts[message.tracking] += 1;
    return {
      t: message.t,
      elapsed_s: firstPose ? (message.t - firstPose.t) / 1000 : 0,
      raw_x: message.raw.p[0],
      raw_y: message.raw.p[1],
      raw_z: message.raw.p[2],
      corrected_x: message.corrected?.p[0] ?? null,
      corrected_y: message.corrected?.p[1] ?? null,
      corrected_z: message.corrected?.p[2] ?? null,
      tracking: message.tracking,
      latency_ms: record.receivedAtMs - message.t,
      marker_visible: markerVisible,
    };
  });

  const checkpoints = (options.checkpoints ?? []).map((checkpoint): CheckpointResult => {
    if (
      !checkpoint.name ||
      !Number.isFinite(checkpoint.t) ||
      checkpoint.expected.length !== 3 ||
      !checkpoint.expected.every(Number.isFinite)
    ) {
      throw new Error('Checkpoint inválido');
    }
    const record = nearestPose(poses, checkpoint.t);
    if (!record) {
      throw new Error(`No hay poses para evaluar el checkpoint ${checkpoint.name}`);
    }
    const message = record.message as PoseMessagePayload;
    return {
      name: checkpoint.name,
      requested_t: checkpoint.t,
      matched_t: message.t,
      time_offset_ms: message.t - checkpoint.t,
      expected: checkpoint.expected,
      raw_error_m: distance(message.raw.p, checkpoint.expected),
      corrected_error_m: message.corrected
        ? distance(message.corrected.p, checkpoint.expected)
        : null,
    };
  });

  const totalPoses = poses.length;
  const messageCounts = { total: records.length, pose: 0, marker: 0, correction: 0, hello: 0 };
  for (const record of records) {
    messageCounts[record.message.type] += 1;
  }

  return {
    run_id: parsedRun.runId,
    duration_s: durationMs / 1000,
    messages: messageCounts,
    update_rate_hz:
      totalPoses > 1 && durationMs > 0 ? ((totalPoses - 1) * 1000) / durationMs : null,
    closure_error_m: {
      raw: firstPose && lastPose ? distance(firstPose.raw.p, lastPose.raw.p) : null,
      corrected:
        firstPose?.corrected && lastPose?.corrected
          ? distance(firstPose.corrected.p, lastPose.corrected.p)
          : null,
    },
    latency_ms: distribution(latencies),
    tracking_percent: {
      tracking: totalPoses > 0 ? (trackingCounts.tracking * 100) / totalPoses : 0,
      limited: totalPoses > 0 ? (trackingCounts.limited * 100) / totalPoses : 0,
      lost: totalPoses > 0 ? (trackingCounts.lost * 100) / totalPoses : 0,
    },
    marker_visibility: {
      window_ms: visibilityWindow,
      visible_pose_samples: visibleSamples,
      total_pose_samples: totalPoses,
      percent: totalPoses > 0 ? (visibleSamples * 100) / totalPoses : 0,
    },
    checkpoints,
    trajectory,
  };
}

function csvValue(value: string | number | boolean | null): string {
  if (value === null) {
    return '';
  }
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function rowsToCsv<T extends object>(rows: readonly T[]): string {
  if (rows.length === 0) {
    return '';
  }
  const headers = Object.keys(rows[0] ?? {});
  return (
    [
      headers.join(','),
      ...rows.map((row) => {
        const values = row as Record<string, string | number | boolean | null>;
        return headers.map((header) => csvValue(values[header] ?? null)).join(',');
      }),
    ].join('\n') + '\n'
  );
}
