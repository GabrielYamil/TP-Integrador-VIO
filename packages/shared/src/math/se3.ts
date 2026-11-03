/**
 * Transformaciones rígidas en SE(3), representadas como posición + cuaternión.
 *
 * Notación usada en todo el proyecto:
 *   T_a_b = pose del marco b expresada en el marco a.
 *
 * Composición:
 *   T_a_c = compose(T_a_b, T_b_c)
 *
 * Un punto p_b se transforma a:
 *   p_a = apply(T_a_b, p_b)
 *
 * Cuaterniones en orden [x, y, z, w].
 */
import type { Mat4 } from './mat4';
import {
  mat4FromArray,
  mat4FromQuatTranslation,
  mat4InvertRigid,
  mat4IsFinite,
  mat4IsRigid,
  mat4ToFloat32Array,
  mat4ToQuatTranslation,
} from './mat4';
import type { Quat } from './quat';
import {
  quatAlmostEqual,
  quatConjugate,
  quatMultiply,
  quatNormalize,
  quatRotateVec3,
  quatSlerp,
} from './quat';
import type { Vec3 } from './vec3';
import { vAdd, vAlmostEqual, vDistance, vScale } from './vec3';

export interface Pose {
  p: Vec3;
  q: Quat;
}

/** Alias explícito para leer las fórmulas T_a_b del plan. */
export type Transform = Pose;

export const POSE_IDENTITY: Pose = { p: [0, 0, 0], q: [0, 0, 0, 1] };

export function poseIdentity(): Pose {
  return { p: [0, 0, 0], q: [0, 0, 0, 1] };
}

export function poseFromQuatTranslation(q: Quat, p: Vec3): Pose {
  return { p: [p[0], p[1], p[2]], q: quatNormalize(q) };
}

export function poseFromMat4(m: Mat4): Pose {
  const { q, p } = mat4ToQuatTranslation(m);
  return { p, q };
}

export function poseToMat4(pose: Pose): Mat4 {
  return mat4FromQuatTranslation(pose.q, pose.p);
}

/**
 * Convierte una matriz de WebXR (`XRView.transform.matrix` o
 * `XRViewerPose.transform.matrix`) a `Pose`. La matriz viene en column-major
 * y describe la pose del marco hijo en el marco de referencia XR.
 */
export function poseFromWebXRMatrix(matrix: ArrayLike<number>): Pose {
  const m = mat4FromArray(matrix);
  if (!mat4IsRigid(m, 1e-4)) {
    throw new Error('La matriz WebXR no es una transformación rígida válida');
  }
  return poseFromMat4(m);
}

export function poseToWebXRMatrix(pose: Pose): Float32Array {
  return mat4ToFloat32Array(poseToMat4(pose));
}

export function compose(a: Pose, b: Pose): Pose {
  return {
    p: vAdd(a.p, quatRotateVec3(a.q, b.p)),
    q: quatNormalize(quatMultiply(a.q, b.q)),
  };
}

export function inverse(a: Pose): Pose {
  const qi = quatNormalize(quatConjugate(a.q));
  return {
    p: vScale(quatRotateVec3(qi, a.p), -1),
    q: qi,
  };
}

export function apply(pose: Pose, point: Vec3): Vec3 {
  return vAdd(pose.p, quatRotateVec3(pose.q, point));
}

export function applyDirection(pose: Pose, direction: Vec3): Vec3 {
  return quatRotateVec3(pose.q, direction);
}

/** Interpolación para suavizado: traslación lineal y rotación por SLERP. */
export function interpolate(a: Pose, b: Pose, t: number): Pose {
  const alpha = Math.min(1, Math.max(0, t));
  return {
    p: [
      a.p[0] + (b.p[0] - a.p[0]) * alpha,
      a.p[1] + (b.p[1] - a.p[1]) * alpha,
      a.p[2] + (b.p[2] - a.p[2]) * alpha,
    ],
    q: quatSlerp(a.q, b.q, alpha),
  };
}

export function poseAlmostEqual(a: Pose, b: Pose, posEps = 1e-9, rotEps = 1e-9): boolean {
  return vAlmostEqual(a.p, b.p, posEps) && quatAlmostEqual(a.q, b.q, rotEps);
}

export function poseToString(pose: Pose, digits = 4): string {
  return `p=[${pose.p.map((n) => n.toFixed(digits)).join(', ')}] q=[${pose.q
    .map((n) => n.toFixed(digits))
    .join(', ')}]`;
}

/** Distancia de traslación entre dos poses (m). */
export function poseDistance(a: Pose, b: Pose): number {
  return vDistance(a.p, b.p);
}

/**
 * Variación relativa `a^-1 * b`, útil para medir saltos de corrección.
 * La rotación resultante se puede convertir a ángulo con `poseAngle`.
 */
export function relativePose(a: Pose, b: Pose): Pose {
  return compose(inverse(a), b);
}

/** Ángulo de la rotación de una pose, en radianes y en [0, pi]. */
export function poseAngle(pose: Pose): number {
  const q = quatNormalize(pose.q);
  return 2 * Math.acos(Math.min(1, Math.abs(q[3])));
}

/** Compatibilidad con consumidores que esperan la inversa rígida de una Mat4. */
export function invertMat4Rigid(m: Mat4): Mat4 {
  if (!mat4IsFinite(m)) {
    throw new Error('La matriz contiene valores no finitos');
  }
  return mat4InvertRigid(m);
}
