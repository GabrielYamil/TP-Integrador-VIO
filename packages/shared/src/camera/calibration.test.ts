import { describe, expect, it } from 'vitest';
import {
  calibrationIntrinsicsForSize,
  parseCameraCalibration,
  safeParseCameraCalibration,
} from './calibration';

const VALID = {
  image_size: [1920, 1080] as [number, number],
  intrinsics: { fx: 1500, fy: 1502, cx: 960, cy: 540 },
};

describe('cameraCalibrationSchema', () => {
  it('accepts a valid calibration with optional metadata', () => {
    const calibration = parseCameraCalibration({
      ...VALID,
      reprojection_error_px: 0.42,
      note: 'Calibración con tablero 9x6',
    });
    expect(calibration.intrinsics.fx).toBe(1500);
    expect(calibration.image_size).toEqual([1920, 1080]);
    expect(calibration.reprojection_error_px).toBe(0.42);
  });

  it('rejects missing fields, extra fields and invalid values', () => {
    expect(safeParseCameraCalibration({ ...VALID, extra: true }).success).toBe(false);
    expect(safeParseCameraCalibration({ image_size: [1920, 1080] }).success).toBe(false);
    expect(
      safeParseCameraCalibration({
        ...VALID,
        intrinsics: { ...VALID.intrinsics, fx: 0 },
      }).success,
    ).toBe(false);
    expect(
      safeParseCameraCalibration({
        ...VALID,
        image_size: [1920, 0],
      }).success,
    ).toBe(false);
    expect(safeParseCameraCalibration({ ...VALID, reprojection_error_px: -1 }).success).toBe(false);
  });
});

describe('calibrationIntrinsicsForSize', () => {
  it('scales the calibration to the processed image', () => {
    const calibration = parseCameraCalibration(VALID);
    const intrinsics = calibrationIntrinsicsForSize(calibration, 640, 360);
    expect(intrinsics.fx).toBeCloseTo(500, 10);
    expect(intrinsics.fy).toBeCloseTo(1502 / 3, 10);
    expect(intrinsics.cx).toBeCloseTo(320, 10);
    expect(intrinsics.cy).toBeCloseTo(180, 10);
  });
});
