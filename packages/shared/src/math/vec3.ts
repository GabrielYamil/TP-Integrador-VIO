/**
 * Operaciones básicas de vectores 3D.
 * Convención: arrays mutables de 3 números [x, y, z].
 */
export type Vec3 = [number, number, number];

export const ZERO_VEC3: Vec3 = [0, 0, 0];

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return [x, y, z];
}

export function vAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vSub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function vScale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function vNeg(v: Vec3): Vec3 {
  return [-v[0], -v[1], -v[2]];
}

export function vDot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vCross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function vLength(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export function vDistance(a: Vec3, b: Vec3): number {
  return vLength(vSub(a, b));
}

export function vNormalize(v: Vec3): Vec3 {
  const len = vLength(v);
  if (len < 1e-12) {
    throw new Error('No se puede normalizar un vector de longitud cero');
  }
  return vScale(v, 1 / len);
}

export function vNormalizeOr(v: Vec3, fallback: Vec3): Vec3 {
  const len = vLength(v);
  return len < 1e-12 ? [...fallback] : vScale(v, 1 / len);
}

export function vProjectOnPlane(v: Vec3, normal: Vec3): Vec3 {
  return vSub(v, vScale(normal, vDot(v, normal)));
}

export function vAlmostEqual(a: Vec3, b: Vec3, eps = 1e-9): boolean {
  return (
    Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps && Math.abs(a[2] - b[2]) <= eps
  );
}

export function vToString(v: Vec3, digits = 4): string {
  return `[${v.map((n) => n.toFixed(digits)).join(', ')}]`;
}
