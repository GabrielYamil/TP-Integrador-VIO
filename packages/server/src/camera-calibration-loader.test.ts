import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadOptionalCameraCalibration } from './camera-calibration-loader';

const VALID = {
  image_size: [1920, 1080],
  intrinsics: { fx: 1500, fy: 1502, cx: 960, cy: 540 },
};

describe('loadOptionalCameraCalibration', () => {
  let directory: string;
  let path: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'vio-camera-'));
    path = join(directory, 'camera_intrinsics.json');
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('returns null when the file does not exist', () => {
    expect(loadOptionalCameraCalibration(path)).toEqual({ calibration: null, error: null });
  });

  it('loads a valid calibration', () => {
    writeFileSync(path, JSON.stringify(VALID), 'utf8');
    const result = loadOptionalCameraCalibration(path);
    expect(result.error).toBeNull();
    expect(result.calibration?.intrinsics.fy).toBe(1502);
  });

  it('reports invalid JSON and schema violations', () => {
    writeFileSync(path, '{', 'utf8');
    expect(loadOptionalCameraCalibration(path).error).toContain('JSON válido');

    writeFileSync(path, JSON.stringify({ image_size: [1920, 1080] }), 'utf8');
    const invalid = loadOptionalCameraCalibration(path);
    expect(invalid.calibration).toBeNull();
    expect(invalid.error).toContain('intrinsics');
  });
});
