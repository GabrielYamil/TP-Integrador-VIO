import { describe, expect, it } from 'vitest';
import { computeCaptureSize, createCameraBinding } from './camera-capture';

describe('computeCaptureSize', () => {
  it('keeps the source size when it is below the maximum', () => {
    expect(computeCaptureSize(640, 480, 640)).toEqual({ width: 640, height: 480 });
    expect(computeCaptureSize(320, 240, 640)).toEqual({ width: 320, height: 240 });
  });

  it('downsamples preserving the aspect ratio', () => {
    expect(computeCaptureSize(1920, 1080, 640)).toEqual({ width: 640, height: 360 });
    expect(computeCaptureSize(1440, 1080, 640)).toEqual({ width: 640, height: 480 });
    expect(computeCaptureSize(1080, 1920, 640)).toEqual({ width: 360, height: 640 });
  });

  it('never produces a zero dimension', () => {
    expect(computeCaptureSize(4000, 10, 640)).toEqual({ width: 640, height: 2 });
    expect(computeCaptureSize(10, 4000, 640)).toEqual({ width: 2, height: 640 });
  });

  it('rejects invalid dimensions', () => {
    expect(() => computeCaptureSize(0, 480, 640)).toThrow(/Ancho/);
    expect(() => computeCaptureSize(640, -1, 640)).toThrow(/Alto/);
    expect(() => computeCaptureSize(640, 480, 0)).toThrow(/Tamaño máximo/);
    expect(() => computeCaptureSize(640.5, 480, 640)).toThrow(/Ancho/);
  });
});

describe('createCameraBinding', () => {
  it('returns null when XRWebGLBinding is not exposed', () => {
    expect(createCameraBinding({} as XRSession, {} as WebGL2RenderingContext)).toBeNull();
  });
});
