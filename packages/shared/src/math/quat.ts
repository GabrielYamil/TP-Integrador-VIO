/**
 * Cuaterniones y matrices de rotación 3x3.
 *
 * Convenciones:
 * - Cuaternión [x, y, z, w].
 * - Matriz 3x3 column-major (igual que WebGL/WebXR): m[col * 3 + row].
 * - q y -q representan la misma rotación.
 */
import type { Vec3 } from './vec3';
import { vAdd, vCross, vDot, vNormalize, vScale, vSub } from './vec3';

export type Quat = [number, number, number, number];
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export const QUAT_IDENTITY: Quat = [0, 0, 0, 1];

export function quatIdentity(): Quat {
  return [0, 0, 0, 1];
}

export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const n = vNormalize(axis);
  const half = angle * 0.5;
  const s = Math.sin(half);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(half)];
}

export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function quatConjugate(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

export function quatNegate(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], -q[3]];
}

export function quatDot(a: Quat, b: Quat): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

export function quatLength(q: Quat): number {
  return Math.hypot(q[0], q[1], q[2], q[3]);
}

export function quatNormalize(q: Quat): Quat {
  const len = quatLength(q);
  if (len < 1e-12) {
    throw new Error('No se puede normalizar un cuaternión de longitud cero');
  }
  const inv = 1 / len;
  return [q[0] * inv, q[1] * inv, q[2] * inv, q[3] * inv];
}

export function quatToMat3(q: Quat): Mat3 {
  const [x, y, z, w] = quatNormalize(q);
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;

  // Column-major: las primeras tres entradas son la primera columna.
  return [
    1 - 2 * (yy + zz),
    2 * (xy + wz),
    2 * (xz - wy),
    2 * (xy - wz),
    1 - 2 * (xx + zz),
    2 * (yz + wx),
    2 * (xz + wy),
    2 * (yz - wx),
    1 - 2 * (xx + yy),
  ];
}

export function quatFromMat3(m: Mat3): Quat {
  const m00 = m[0];
  const m10 = m[1];
  const m20 = m[2];
  const m01 = m[3];
  const m11 = m[4];
  const m21 = m[5];
  const m02 = m[6];
  const m12 = m[7];
  const m22 = m[8];

  const trace = m00 + m11 + m22;
  let x: number;
  let y: number;
  let z: number;
  let w: number;

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    w = 0.25 / s;
    x = (m21 - m12) * s;
    y = (m02 - m20) * s;
    z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }

  return quatNormalize([x, y, z, w]);
}

export function quatRotateVec3(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const qv: Vec3 = [x, y, z];
  const t = vScale(vCross(qv, v), 2);
  return vAdd(v, vAdd(vScale(t, w), vCross(qv, t)));
}

export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  const clampedT = Math.min(1, Math.max(0, t));
  let cosHalfTheta = quatDot(a, b);
  let end = b;

  if (cosHalfTheta < 0) {
    end = quatNegate(b);
    cosHalfTheta = -cosHalfTheta;
  }

  if (cosHalfTheta > 0.9995) {
    const lerped: Quat = [
      a[0] + (end[0] - a[0]) * clampedT,
      a[1] + (end[1] - a[1]) * clampedT,
      a[2] + (end[2] - a[2]) * clampedT,
      a[3] + (end[3] - a[3]) * clampedT,
    ];
    return quatNormalize(lerped);
  }

  const halfTheta = Math.acos(Math.min(1, Math.max(-1, cosHalfTheta)));
  const sinHalfTheta = Math.sqrt(1 - cosHalfTheta * cosHalfTheta);
  const ratioA = Math.sin((1 - clampedT) * halfTheta) / sinHalfTheta;
  const ratioB = Math.sin(clampedT * halfTheta) / sinHalfTheta;

  return quatNormalize([
    a[0] * ratioA + end[0] * ratioB,
    a[1] * ratioA + end[1] * ratioB,
    a[2] * ratioA + end[2] * ratioB,
    a[3] * ratioA + end[3] * ratioB,
  ]);
}

export function quatAlmostEqual(a: Quat, b: Quat, eps = 1e-9): boolean {
  const na = quatNormalize(a);
  const nb = quatNormalize(b);
  return Math.abs(quatDot(na, nb)) >= 1 - eps;
}

export function quatToString(q: Quat, digits = 4): string {
  return `[${q.map((n) => n.toFixed(digits)).join(', ')}]`;
}

/** Construye una rotación a partir de tres ejes ortonormales expresados en el marco padre. */
export function quatFromBasis(x: Vec3, y: Vec3, z: Vec3): Quat {
  const m: Mat3 = [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]];
  return quatFromMat3(m);
}

/** Verifica que una base sea ortonormal y derecha (para tests y utilidades). */
export function isRightHandedBasis(x: Vec3, y: Vec3, z: Vec3, eps = 1e-9): boolean {
  return (
    Math.abs(vDot(x, y)) < eps &&
    Math.abs(vDot(x, z)) < eps &&
    Math.abs(vDot(y, z)) < eps &&
    Math.abs(vDot(vCross(x, y), z) - 1) < eps &&
    Math.abs(vDot(x, x) - 1) < eps &&
    Math.abs(vDot(y, y) - 1) < eps &&
    Math.abs(vDot(z, z) - 1) < eps
  );
}

/** Normaliza un vector y lo proyecta sobre el plano perpendicular a `normal`. */
export function orthonormalizeAroundNormal(up: Vec3, normal: Vec3): Vec3 {
  const n = vNormalize(normal);
  return vNormalize(vSub(up, vScale(n, vDot(up, n))));
}
