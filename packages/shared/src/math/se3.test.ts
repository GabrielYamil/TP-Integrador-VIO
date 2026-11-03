import { describe, expect, it } from 'vitest';
import { C_WEBXR_CV } from '../conventions/axes';
import { correctionDelta, correctedCameraPose, estimateCorrection } from '../markers/correction';
import type { Mat4 } from './mat4';
import {
  mat4AlmostEqual,
  mat4FromAxisAngle,
  mat4FromQuatTranslation,
  mat4Identity,
  mat4Invert,
  mat4InvertRigid,
  mat4IsRigid,
  mat4Multiply,
  mat4ToQuatTranslation,
} from './mat4';
import type { Quat } from './quat';
import { quatDot, quatFromAxisAngle, quatNormalize, quatRotateVec3 } from './quat';
import type { Pose, Transform } from './se3';
import {
  apply,
  applyDirection,
  compose,
  interpolate,
  inverse,
  poseAlmostEqual,
  poseAngle,
  poseFromMat4,
  poseFromQuatTranslation,
  poseFromWebXRMatrix,
  poseIdentity,
  poseToMat4,
  poseToWebXRMatrix,
  relativePose,
} from './se3';
import type { Vec3 } from './vec3';
import { vAlmostEqual, vDistance } from './vec3';

const X: Vec3 = [1, 0, 0];
const Y: Vec3 = [0, 1, 0];
const Z: Vec3 = [0, 0, 1];
const IDENTITY_Q: Quat = [0, 0, 0, 1];

function expectVecClose(actual: Vec3, expected: Vec3, eps = 1e-9): void {
  expect(vAlmostEqual(actual, expected, eps)).toBe(true);
}

function expectPoseClose(actual: Pose, expected: Pose, eps = 1e-9): void {
  expect(mat4AlmostEqual(poseToMat4(actual), poseToMat4(expected), eps)).toBe(true);
}

function expectMatClose(actual: Mat4, expected: Mat4, eps = 1e-9): void {
  expect(mat4AlmostEqual(actual, expected, eps)).toBe(true);
}

const rotation90 = (axis: Vec3): Quat => quatFromAxisAngle(axis, Math.PI / 2);

describe('mat4', () => {
  it('convierte cuaternión y traslación a matriz y viceversa', () => {
    const q = quatNormalize([0.2, -0.3, 0.1, 0.9]);
    const p: Vec3 = [1.5, -2, 0.25];
    const m = mat4FromQuatTranslation(q, p);
    expect(mat4IsRigid(m)).toBe(true);
    const back = mat4ToQuatTranslation(m);
    expect(vAlmostEqual(back.p, p)).toBe(true);
    expect(Math.abs(quatDot(back.q, q))).toBeCloseTo(1, 12);
  });

  it('calcula la inversa rígida y la inversa general', () => {
    const m = mat4FromQuatTranslation(quatFromAxisAngle([1, 2, 3], 0.7), [3, -1, 2]);
    expectMatClose(mat4Multiply(m, mat4InvertRigid(m)), mat4Identity(), 1e-12);
    expectMatClose(mat4Multiply(m, mat4Invert(m)), mat4Identity(), 1e-10);
  });

  it('aplica rotaciones de 90 grados sobre cada eje', () => {
    const qz = rotation90(Z);
    expectVecClose(quatRotateVec3(qz, X), Y);
    expectVecClose(quatRotateVec3(qz, Y), [-1, 0, 0]);

    const qx = rotation90(X);
    expectVecClose(quatRotateVec3(qx, Y), Z);
    expectVecClose(quatRotateVec3(qx, Z), [0, -1, 0]);

    const qy = rotation90(Y);
    expectVecClose(quatRotateVec3(qy, Z), X);
    expectVecClose(quatRotateVec3(qy, X), [0, 0, -1]);

    expect(
      mat4AlmostEqual(mat4FromAxisAngle(Z, Math.PI / 2), mat4FromQuatTranslation(qz, [0, 0, 0])),
    ).toBe(true);
  });
});

describe('se3', () => {
  const T_world_odom: Transform = poseFromQuatTranslation(quatFromAxisAngle(Z, 0.4), [1, 2, 0]);
  const T_odom_cam: Transform = poseFromQuatTranslation(
    quatFromAxisAngle([1, 0, 0], -0.2),
    [0.5, 1.4, -0.3],
  );

  it('compone y aplica puntos correctamente', () => {
    const point: Vec3 = [0.1, 0.2, 0.3];
    expectVecClose(
      apply(compose(T_world_odom, T_odom_cam), point),
      apply(T_world_odom, apply(T_odom_cam, point)),
      1e-12,
    );
    expectVecClose(
      applyDirection(compose(T_world_odom, T_odom_cam), point),
      applyDirection(T_world_odom, applyDirection(T_odom_cam, point)),
      1e-12,
    );
  });

  it('cumple T * T^-1 = I y la asociatividad', () => {
    expectPoseClose(compose(T_world_odom, inverse(T_world_odom)), poseIdentity());
    const a = T_world_odom;
    const b = T_odom_cam;
    const c = poseFromQuatTranslation(quatFromAxisAngle(Y, 0.8), [-1, 0.3, 2]);
    expectPoseClose(compose(compose(a, b), c), compose(a, compose(b, c)), 1e-12);
  });

  it('convierte poses a la matriz de WebXR y vuelve', () => {
    const pose = poseFromQuatTranslation(
      quatFromAxisAngle([0.3, -0.4, 0.5], 1.1),
      [0.4, -0.7, 2.1],
    );
    const matrix = poseToWebXRMatrix(pose);
    expect(matrix).toBeInstanceOf(Float32Array);
    const back = poseFromWebXRMatrix(matrix);
    expect(vDistance(back.p, pose.p)).toBeLessThan(1e-6);
    expect(poseAngle(relativePose(back, pose))).toBeLessThan(1e-6);
    expectPoseClose(back, pose, 1e-6);
  });

  it('interpola posición y rotación', () => {
    const a = poseFromQuatTranslation(IDENTITY_Q, [0, 0, 0]);
    const b = poseFromQuatTranslation(rotation90(Z), [2, 4, -2]);
    const half = interpolate(a, b, 0.5);
    expect(vDistance(half.p, [1, 2, -1])).toBeLessThan(1e-12);
    const expectedHalf = poseFromQuatTranslation(quatFromAxisAngle(Z, Math.PI / 4), [1, 2, -1]);
    expectPoseClose(half, expectedHalf, 1e-12);
    expect(interpolate(a, b, -1).p).toEqual([0, 0, 0]);
    expect(interpolate(a, b, 2).p).toEqual([2, 4, -2]);
  });

  it('convierte matrices y detecta matrices no rígidas', () => {
    const pose = poseFromQuatTranslation(quatFromAxisAngle(Y, 0.3), [1, 2, 3]);
    expectPoseClose(poseFromMat4(poseToMat4(pose)), pose, 1e-12);
    const broken = mat4Identity();
    broken[0] = 2;
    expect(() => poseFromWebXRMatrix(broken)).toThrow();
  });

  it('calcula el ángulo de una rotación', () => {
    expect(poseAngle(poseFromQuatTranslation(rotation90(Z), [0, 0, 0]))).toBeCloseTo(
      Math.PI / 2,
      12,
    );
    expect(poseAlmostEqual(poseIdentity(), poseIdentity())).toBe(true);
  });
});

describe('corrección', () => {
  const T_world_odom = poseFromQuatTranslation(quatFromAxisAngle(Z, 0.6), [1.2, -0.4, 0]);
  const T_odom_cam = poseFromQuatTranslation(quatFromAxisAngle([1, 0, 0], 0.1), [0.3, 1.5, -0.8]);
  const T_world_marker = poseFromQuatTranslation(
    quatFromAxisAngle([0, 1, 0], Math.PI / 2),
    [2.5, 1.8, 1.2],
  );

  // Observación sintética construida a partir de la geometría verdadera:
  // T_cam_marker = C^-1 * T_odom_cam^-1 * T_odom_marker.
  const T_cam_marker = compose(
    compose(inverse(C_WEBXR_CV), inverse(T_odom_cam)),
    compose(inverse(T_world_odom), T_world_marker),
  );

  it('recupera T_world_odom y T_world_cam con error menor a 1e-6', () => {
    const estimate = estimateCorrection({
      markerId: 7,
      T_odom_cam,
      T_cam_marker,
      T_world_marker,
    });
    expectPoseClose(estimate.T_world_odom, T_world_odom, 1e-6);
    expectPoseClose(estimate.T_world_cam, compose(T_world_odom, T_odom_cam), 1e-6);
    expect(estimate.markerId).toBe(7);
  });

  it('corrige una deriva conocida de la pose de la cámara', () => {
    const drift = poseFromQuatTranslation(quatFromAxisAngle([0, 1, 0], 0.05), [0.08, -0.03, 0.02]);
    const T_odom_cam_drifted = compose(T_odom_cam, drift);
    const estimate = estimateCorrection({
      markerId: 7,
      T_odom_cam: T_odom_cam_drifted,
      T_cam_marker,
      T_world_marker,
    });
    const corrected = correctedCameraPose(estimate.T_world_odom, T_odom_cam_drifted);
    expectPoseClose(corrected, compose(T_world_odom, T_odom_cam), 1e-6);
  });

  it('mide el salto de corrección', () => {
    const delta = correctionDelta(
      poseFromQuatTranslation(IDENTITY_Q, [0, 0, 0]),
      poseFromQuatTranslation(rotation90(Z), [3, 4, 0]),
    );
    expect(delta.delta_p_m).toBeCloseTo(5, 12);
    expect(delta.delta_angle_rad).toBeCloseTo(Math.PI / 2, 12);
  });
});
