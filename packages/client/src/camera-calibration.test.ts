import { describe, expect, it } from 'vitest';
import type { FetchLike } from './camera-calibration';
import { fetchCameraCalibration } from './camera-calibration';

const VALID = {
  image_size: [1920, 1080],
  intrinsics: { fx: 1500, fy: 1502, cx: 960, cy: 540 },
};

function response(status: number, json: () => Promise<unknown>): ReturnType<FetchLike> {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json });
}

describe('fetchCameraCalibration', () => {
  it('loads and validates a calibration', async () => {
    const result = await fetchCameraCalibration('/config/camera_intrinsics.json', () =>
      response(200, async () => VALID),
    );
    expect(result.status).toBe('ok');
    expect(result.calibration?.intrinsics.fx).toBe(1500);
    expect(result.message).toContain('1920×1080');
  });

  it('reports a missing calibration on 404', async () => {
    const result = await fetchCameraCalibration('/config/camera_intrinsics.json', () =>
      response(404, async () => ({})),
    );
    expect(result).toMatchObject({ status: 'missing', calibration: null });
  });

  it('reports HTTP and network errors', async () => {
    const http = await fetchCameraCalibration('/config/camera_intrinsics.json', () =>
      response(503, async () => ({})),
    );
    expect(http.status).toBe('error');
    expect(http.message).toContain('503');

    const network = await fetchCameraCalibration('/config/camera_intrinsics.json', () =>
      Promise.reject(new Error('offline')),
    );
    expect(network.status).toBe('error');
    expect(network.message).toContain('offline');
  });

  it('rejects invalid JSON and schema violations', async () => {
    const invalidJson = await fetchCameraCalibration('/config/camera_intrinsics.json', () =>
      response(200, () => Promise.reject(new Error('boom'))),
    );
    expect(invalidJson.status).toBe('invalid');
    expect(invalidJson.message).toContain('JSON');

    const invalidSchema = await fetchCameraCalibration('/config/camera_intrinsics.json', () =>
      response(200, async () => ({ image_size: [1920, 1080] })),
    );
    expect(invalidSchema.status).toBe('invalid');
    expect(invalidSchema.message).toContain('intrinsics');
  });
});
