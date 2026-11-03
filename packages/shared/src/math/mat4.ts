/**
 * Matrices homogéneas 4x4 en orden column-major.
 *
 * El formato coincide con `XRRigidTransform.matrix` y con WebGL:
 *   m[col * 4 + row]
 *
 * La traslación está en m[12], m[13], m[14].
 */
import type { Quat } from './quat';
import { quatFromAxisAngle, quatFromMat3, quatToMat3 } from './quat';
import type { Vec3 } from './vec3';

export type Mat4 = Float64Array;

export function mat4Identity(): Mat4 {
  const m = new Float64Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

export function mat4FromQuatTranslation(q: Quat, p: Vec3): Mat4 {
  const r = quatToMat3(q);
  const m = new Float64Array(16);
  m[0] = r[0];
  m[1] = r[1];
  m[2] = r[2];
  m[4] = r[3];
  m[5] = r[4];
  m[6] = r[5];
  m[8] = r[6];
  m[9] = r[7];
  m[10] = r[8];
  m[12] = p[0];
  m[13] = p[1];
  m[14] = p[2];
  m[15] = 1;
  return m;
}

export function mat4FromTranslation(t: Vec3): Mat4 {
  const m = mat4Identity();
  m[12] = t[0];
  m[13] = t[1];
  m[14] = t[2];
  return m;
}

export function mat4FromAxisAngle(axis: Vec3, angle: number): Mat4 {
  return mat4FromQuatTranslation(quatFromAxisAngle(axis, angle), [0, 0, 0]);
}

/** Producto a * b, ambos column-major. */
export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float64Array(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/** Inversa de una transformación rígida (R, t): [R^T, -R^T t]. */
export function mat4InvertRigid(m: Mat4): Mat4 {
  const out = new Float64Array(16);
  out[0] = m[0];
  out[1] = m[4];
  out[2] = m[8];
  out[4] = m[1];
  out[5] = m[5];
  out[6] = m[9];
  out[8] = m[2];
  out[9] = m[6];
  out[10] = m[10];

  const tx = m[12];
  const ty = m[13];
  const tz = m[14];
  out[12] = -(out[0] * tx + out[4] * ty + out[8] * tz);
  out[13] = -(out[1] * tx + out[5] * ty + out[9] * tz);
  out[14] = -(out[2] * tx + out[6] * ty + out[10] * tz);
  out[15] = 1;
  return out;
}

/** Inversa general 4x4 por cofactores. Para SE(3) usar mat4InvertRigid. */
export function mat4Invert(m: Mat4): Mat4 {
  const a00 = m[0];
  const a01 = m[1];
  const a02 = m[2];
  const a03 = m[3];
  const a10 = m[4];
  const a11 = m[5];
  const a12 = m[6];
  const a13 = m[7];
  const a20 = m[8];
  const a21 = m[9];
  const a22 = m[10];
  const a23 = m[11];
  const a30 = m[12];
  const a31 = m[13];
  const a32 = m[14];
  const a33 = m[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(det) < 1e-15) {
    throw new Error('La matriz no es invertible');
  }
  const invDet = 1 / det;
  const out = new Float64Array(16);
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * invDet;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * invDet;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * invDet;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * invDet;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * invDet;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * invDet;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * invDet;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * invDet;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * invDet;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * invDet;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * invDet;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * invDet;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * invDet;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * invDet;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * invDet;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * invDet;
  return out;
}

export function mat4ToQuatTranslation(m: Mat4): { q: Quat; p: Vec3 } {
  return {
    q: quatFromMat3([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]),
    p: [m[12], m[13], m[14]],
  };
}

export function mat4TransformPoint(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

export function mat4TransformDirection(m: Mat4, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2],
  ];
}

export function mat4GetTranslation(m: Mat4): Vec3 {
  return [m[12], m[13], m[14]];
}

export function mat4AlmostEqual(a: Mat4, b: Mat4, eps = 1e-9): boolean {
  for (let i = 0; i < 16; i += 1) {
    if (Math.abs(a[i] - b[i]) > eps) {
      return false;
    }
  }
  return true;
}

export function mat4IsFinite(m: Mat4): boolean {
  for (let i = 0; i < 16; i += 1) {
    if (!Number.isFinite(m[i])) {
      return false;
    }
  }
  return true;
}

/** Verifica que la parte 3x3 sea ortonormal derecha y la última fila sea [0,0,0,1]. */
export function mat4IsRigid(m: Mat4, eps = 1e-6): boolean {
  const c0: Vec3 = [m[0], m[1], m[2]];
  const c1: Vec3 = [m[4], m[5], m[6]];
  const c2: Vec3 = [m[8], m[9], m[10]];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
  const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const rightHanded = cross(c0, c1);
  return (
    Math.abs(dot(c0, c1)) < eps &&
    Math.abs(dot(c0, c2)) < eps &&
    Math.abs(dot(c1, c2)) < eps &&
    Math.abs(len(c0) - 1) < eps &&
    Math.abs(len(c1) - 1) < eps &&
    Math.abs(len(c2) - 1) < eps &&
    Math.abs(rightHanded[0] - c2[0]) < eps &&
    Math.abs(rightHanded[1] - c2[1]) < eps &&
    Math.abs(rightHanded[2] - c2[2]) < eps &&
    Math.abs(m[3]) < eps &&
    Math.abs(m[7]) < eps &&
    Math.abs(m[11]) < eps &&
    Math.abs(m[15] - 1) < eps
  );
}

export function mat4ToFloat32Array(m: Mat4): Float32Array {
  return new Float32Array(m);
}

/** Copia una matriz de 16 elementos (por ejemplo, `XRView.transform.matrix`). */
export function mat4FromArray(values: ArrayLike<number>): Mat4 {
  if (values.length !== 16) {
    throw new Error(`Se esperaban 16 elementos, se recibieron ${values.length}`);
  }
  const m = new Float64Array(values);
  if (!mat4IsFinite(m)) {
    throw new Error('La matriz contiene valores no finitos');
  }
  return m;
}

export function mat4ToString(m: Mat4, digits = 4): string {
  const rows: string[] = [];
  for (let row = 0; row < 4; row += 1) {
    const values: string[] = [];
    for (let col = 0; col < 4; col += 1) {
      values.push(m[col * 4 + row].toFixed(digits));
    }
    rows.push(`[${values.join(', ')}]`);
  }
  return rows.join('\n');
}
