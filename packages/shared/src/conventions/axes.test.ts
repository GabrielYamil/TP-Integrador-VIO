import { describe, expect, it } from 'vitest';
import { C_CV_ROS, C_CV_WEBXR, C_ROS_CV, C_ROS_WEBXR, C_WEBXR_CV, C_WEBXR_ROS } from './axes';
import { T_WORLD_ODOM_INITIAL, worldFromOdomInitial } from './initial';
import { mat4IsRigid } from '../math/mat4';
import { applyDirection, compose, poseAlmostEqual, poseIdentity, poseToMat4 } from '../math/se3';
import type { Vec3 } from '../math/vec3';
import { vAlmostEqual } from '../math/vec3';

const X: Vec3 = [1, 0, 0];
const Y: Vec3 = [0, 1, 0];
const Z: Vec3 = [0, 0, 1];

function expectDirection(actual: Vec3, expected: Vec3): void {
  expect(vAlmostEqual(actual, expected, 1e-12)).toBe(true);
}

describe('conversiones de ejes', () => {
  it('C_WEBXR_CV gira 180 grados sobre x', () => {
    expectDirection(applyDirection(C_WEBXR_CV, X), X);
    expectDirection(applyDirection(C_WEBXR_CV, Y), [0, -1, 0]);
    expectDirection(applyDirection(C_WEBXR_CV, Z), [0, 0, -1]);
    expectDirection(applyDirection(C_CV_WEBXR, X), X);
    expectDirection(applyDirection(C_CV_WEBXR, Y), [0, -1, 0]);
    expectDirection(applyDirection(C_CV_WEBXR, Z), [0, 0, -1]);
  });

  it('C_ROS_WEBXR lleva WebXR a ROS', () => {
    expectDirection(applyDirection(C_ROS_WEBXR, X), [0, -1, 0]);
    expectDirection(applyDirection(C_ROS_WEBXR, Y), [0, 0, 1]);
    expectDirection(applyDirection(C_ROS_WEBXR, Z), [-1, 0, 0]);
  });

  it('C_WEBXR_ROS es la inversa de C_ROS_WEBXR', () => {
    expectDirection(applyDirection(C_WEBXR_ROS, [0, -1, 0]), X);
    expectDirection(applyDirection(C_WEBXR_ROS, [0, 0, 1]), Y);
    expectDirection(applyDirection(C_WEBXR_ROS, [-1, 0, 0]), Z);
    expect(poseAlmostEqual(compose(C_ROS_WEBXR, C_WEBXR_ROS), poseIdentity())).toBe(true);
    expect(poseAlmostEqual(compose(C_WEBXR_ROS, C_ROS_WEBXR), poseIdentity())).toBe(true);
  });

  it('C_ROS_CV mapea la cámara OpenCV a ROS', () => {
    expectDirection(applyDirection(C_ROS_CV, X), [0, -1, 0]);
    expectDirection(applyDirection(C_ROS_CV, Y), [0, 0, -1]);
    expectDirection(applyDirection(C_ROS_CV, Z), X);
    expect(poseAlmostEqual(compose(C_ROS_CV, C_CV_ROS), poseIdentity())).toBe(true);
    expect(poseAlmostEqual(compose(C_CV_ROS, C_ROS_CV), poseIdentity())).toBe(true);
  });

  it('todas las conversiones son rotaciones rígidas', () => {
    for (const conversion of [
      C_WEBXR_CV,
      C_CV_WEBXR,
      C_ROS_WEBXR,
      C_WEBXR_ROS,
      C_ROS_CV,
      C_CV_ROS,
    ]) {
      expect(mat4IsRigid(poseToMat4(conversion), 1e-12)).toBe(true);
    }
  });

  it('la pose inicial mantiene world z-arriba y x-adelante', () => {
    expect(poseAlmostEqual(T_WORLD_ODOM_INITIAL, C_ROS_WEBXR)).toBe(true);
    const initial = worldFromOdomInitial();
    expectDirection(applyDirection(initial, Z), [-1, 0, 0]);
    // La cámara WebXR mira hacia -z: al inicio debe mirar hacia +x de world.
    expectDirection(applyDirection(initial, [0, 0, -1]), X);
    // "Arriba" en WebXR es +y: debe quedar en +z de world.
    expectDirection(applyDirection(initial, Y), Z);
    // "Derecha" en WebXR es +x: en ROS (y izquierda) debe quedar en -y.
    expectDirection(applyDirection(initial, X), [0, -1, 0]);
  });
});
