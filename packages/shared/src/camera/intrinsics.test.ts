import { describe, expect, it } from 'vitest';
import type { IntrinsicsWithSkew } from './intrinsics';
import {
  intrinsicsFromProjectionMatrix,
  scaleIntrinsics,
  scaleIntrinsicsToSize,
  scaleIntrinsicsWithSkew,
} from './intrinsics';

/**
 * Matriz column-major con la misma estructura que `XRView.projectionMatrix`.
 * Solo se usan p0, p4, p5, p8 y p9 para los intrínsecos.
 */
function projectionMatrix(p0: number, p4: number, p5: number, p8: number, p9: number) {
  const matrix = new Float64Array(16);
  matrix[0] = p0;
  matrix[4] = p4;
  matrix[5] = p5;
  matrix[8] = p8;
  matrix[9] = p9;
  matrix[10] = -1;
  matrix[11] = -1;
  matrix[15] = 0;
  return matrix;
}

function expectIntrinsics(actual: IntrinsicsWithSkew, expected: IntrinsicsWithSkew): void {
  expect(actual.fx).toBeCloseTo(expected.fx, 10);
  expect(actual.fy).toBeCloseTo(expected.fy, 10);
  expect(actual.cx).toBeCloseTo(expected.cx, 10);
  expect(actual.cy).toBeCloseTo(expected.cy, 10);
  expect(actual.skew).toBeCloseTo(expected.skew, 10);
}

describe('intrinsicsFromProjectionMatrix', () => {
  it('derives focal lengths and principal point for a symmetric frustum', () => {
    const width = 640;
    const height = 480;
    const tanHalfFov = Math.tan(Math.PI / 6);
    const aspect = width / height;
    const projection = projectionMatrix(1 / (aspect * tanHalfFov), 0, 1 / tanHalfFov, 0, 0);

    const intrinsics = intrinsicsFromProjectionMatrix(projection, {
      x: 0,
      y: 0,
      width,
      height,
    });

    const expectedFocal = height / 2 / tanHalfFov;
    expectIntrinsics(intrinsics, {
      fx: expectedFocal,
      fy: expectedFocal,
      cx: width / 2,
      cy: height / 2,
      skew: 0,
    });
  });

  it('handles an off-center frustum and mirrors cy to top-left', () => {
    // Frustum asimétrico: l=-0.4, r=0.6, b=-0.3, t=0.5, near=0.1.
    const projection = projectionMatrix(0.2, 0.01, 0.25, 0.2, 0.25);
    const viewport = { x: 0, y: 0, width: 640, height: 480 };

    const topLeft = intrinsicsFromProjectionMatrix(projection, viewport);
    expectIntrinsics(topLeft, {
      fx: 64,
      fy: 60,
      cx: 256,
      // cy con origen abajo: (1 - 0.25) * 480 / 2 = 180; arriba: 480 - 180.
      cy: 300,
      skew: 3.2,
    });

    const bottomLeft = intrinsicsFromProjectionMatrix(projection, viewport, {
      origin: 'bottom-left',
    });
    expectIntrinsics(bottomLeft, {
      fx: 64,
      fy: 60,
      cx: 256,
      cy: 180,
      skew: 3.2,
    });
  });

  it('respects a viewport offset for cx and cy', () => {
    const projection = projectionMatrix(2, 0, 2, 0, 0);
    const intrinsics = intrinsicsFromProjectionMatrix(projection, {
      x: 100,
      y: 50,
      width: 200,
      height: 100,
    });
    expectIntrinsics(intrinsics, {
      fx: 200,
      fy: 100,
      cx: 200,
      cy: 100,
      skew: 0,
    });
  });

  it('scales intrinsics to the processed image size', () => {
    const derived = intrinsicsFromProjectionMatrix(projectionMatrix(0.2, 0.01, 0.25, 0.2, 0.25), {
      x: 0,
      y: 0,
      width: 640,
      height: 480,
    });

    const scaled = scaleIntrinsicsWithSkew(derived, 0.5, 0.5);
    expectIntrinsics(scaled, {
      fx: 32,
      fy: 30,
      cx: 128,
      cy: 150,
      skew: 1.6,
    });
  });

  it('rejects invalid matrices and viewports', () => {
    expect(() =>
      intrinsicsFromProjectionMatrix([1, 2, 3], { x: 0, y: 0, width: 640, height: 480 }),
    ).toThrow(/16 elementos/);

    expect(() =>
      intrinsicsFromProjectionMatrix(projectionMatrix(Number.NaN, 0, 1, 0, 0), {
        x: 0,
        y: 0,
        width: 640,
        height: 480,
      }),
    ).toThrow(/no es finito/);

    expect(() =>
      intrinsicsFromProjectionMatrix(projectionMatrix(0, 0, 1, 0, 0), {
        x: 0,
        y: 0,
        width: 640,
        height: 480,
      }),
    ).toThrow(/focales positivas/);

    expect(() =>
      intrinsicsFromProjectionMatrix(projectionMatrix(1, 0, 1, 0, 0), {
        x: 0,
        y: 0,
        width: 0,
        height: 480,
      }),
    ).toThrow(/viewport/);
  });
});

describe('scaleIntrinsics', () => {
  it('scales x and y independently', () => {
    const scaled = scaleIntrinsics({ fx: 100, fy: 200, cx: 50, cy: 60 }, 0.5, 0.25);
    expect(scaled).toEqual({ fx: 50, fy: 50, cx: 25, cy: 15 });
  });

  it('converts between image sizes', () => {
    const scaled = scaleIntrinsicsToSize(
      { fx: 1500, fy: 1500, cx: 960, cy: 540 },
      [1920, 1080],
      [640, 360],
    );
    expect(scaled.fx).toBeCloseTo(500, 10);
    expect(scaled.fy).toBeCloseTo(500, 10);
    expect(scaled.cx).toBeCloseTo(320, 10);
    expect(scaled.cy).toBeCloseTo(180, 10);
  });

  it('rejects non-positive scales and invalid sizes', () => {
    expect(() => scaleIntrinsics({ fx: 1, fy: 1, cx: 0, cy: 0 }, 0)).toThrow(/positivo/);
    expect(() =>
      scaleIntrinsicsToSize({ fx: 1, fy: 1, cx: 0, cy: 0 }, [0, 480], [640, 480]),
    ).toThrow(/from/);
    expect(() =>
      scaleIntrinsicsToSize({ fx: 1, fy: 1, cx: 0, cy: 0 }, [640, 480], [640.5, 480]),
    ).toThrow(/to/);
  });
});
