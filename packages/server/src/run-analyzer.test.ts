import { describe, expect, it } from 'vitest';
import { analyzeRunJsonl, rowsToCsv } from './run-analyzer';

function record(sequence: number, message?: Record<string, unknown>, receivedAtMs = 1000): string {
  if (!message) {
    return JSON.stringify({
      format: 'vio-run',
      format_version: 1,
      record_type: sequence === 0 ? 'run_start' : 'run_end',
      run_id: 'run-test',
      sequence,
      server_time_ms: receivedAtMs,
    });
  }
  return JSON.stringify({
    format: 'vio-run',
    format_version: 1,
    record_type: 'client_message',
    run_id: 'run-test',
    sequence,
    server_time_ms: receivedAtMs,
    context: { client_id: 1, device: 'test', received_at_ms: receivedAtMs },
    message,
  });
}

function pose(
  t: number,
  raw: [number, number, number],
  corrected?: [number, number, number],
): Record<string, unknown> {
  return {
    type: 'pose',
    t,
    raw: { p: raw, q: [0, 0, 0, 1] },
    ...(corrected ? { corrected: { p: corrected, q: [0, 0, 0, 1] } } : {}),
    tracking: 'tracking',
  };
}

describe('run analyzer', () => {
  it('calculates rate, closure drift, latency and marker visibility', () => {
    const jsonl = [
      record(0),
      record(1, pose(1000, [0, 0, 0], [0, 0, 0]), 1010),
      record(
        2,
        {
          type: 'marker',
          t: 1450,
          id: 0,
          T_cam_marker: { p: [0, 0, 1], q: [0, 0, 0, 1] },
          reproj_err_px: 1,
        },
        1462,
      ),
      record(3, pose(1500, [1, 0, 0], [0.9, 0, 0]), 1515),
      record(4, pose(2000, [0.3, 0.4, 0], [0.1, 0, 0]), 2020),
      record(5, undefined, 2100),
    ].join('\n');

    const result = analyzeRunJsonl(jsonl, { markerVisibilityWindowMs: 200 });
    expect(result.update_rate_hz).toBe(2);
    expect(result.closure_error_m.raw).toBeCloseTo(0.5);
    expect(result.closure_error_m.corrected).toBeCloseTo(0.1);
    expect(result.latency_ms).toMatchObject({ count: 3, mean: 15, p50: 15, p95: 20, max: 20 });
    expect(result.marker_visibility).toMatchObject({
      visible_pose_samples: 1,
      total_pose_samples: 3,
    });
    expect(result.marker_visibility.percent).toBeCloseTo(100 / 3);
  });

  it('evaluates checkpoints against the nearest pose', () => {
    const jsonl = [
      record(0),
      record(1, pose(1000, [0, 0, 0]), 1005),
      record(2, pose(2000, [1.2, 0, 0], [1.05, 0, 0]), 2005),
      record(3, undefined, 2100),
    ].join('\n');
    const result = analyzeRunJsonl(jsonl, {
      checkpoints: [{ name: 'P1', t: 1900, expected: [1, 0, 0] }],
    });
    expect(result.checkpoints[0]).toMatchObject({ matched_t: 2000, time_offset_ms: 100 });
    expect(result.checkpoints[0]?.raw_error_m).toBeCloseTo(0.2);
    expect(result.checkpoints[0]?.corrected_error_m).toBeCloseTo(0.05);
  });

  it('rejects malformed and mixed runs', () => {
    expect(() => analyzeRunJsonl('{bad json')).toThrow('JSON inválido');
    const otherRun = JSON.parse(record(1, pose(1000, [0, 0, 0]))) as Record<string, unknown>;
    otherRun.run_id = 'other';
    expect(() => analyzeRunJsonl([record(0), JSON.stringify(otherRun)].join('\n'))).toThrow(
      'otra corrida',
    );
  });

  it('returns null metrics when there are no poses', () => {
    const result = analyzeRunJsonl([record(0), record(1, undefined, 1100)].join('\n'));
    expect(result.run_id).toBe('run-test');
    expect(result.update_rate_hz).toBeNull();
    expect(result.closure_error_m.raw).toBeNull();
    expect(result.marker_visibility.percent).toBe(0);
  });

  it('exports RFC-compatible CSV values', () => {
    const csv = rowsToCsv([{ name: 'Punto, 1', value: 2, ok: true, empty: null }]);
    expect(csv).toBe('name,value,ok,empty\n"Punto, 1",2,true,\n');
  });
});
