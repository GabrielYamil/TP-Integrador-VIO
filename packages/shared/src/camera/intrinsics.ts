/**
 * Intrínsecos de cámara a partir de la matriz de proyección de un XRView.
 *
 * Fuente oficial: WebXR Raw Camera Access explainer, sección "Obtaining camera
 * extrinsics and intrinsics":
 * https://github.com/immersive-web/raw-camera-access/blob/main/explainer.md
 *
 * La matriz de proyección de WebXR/WebGL está en column-major y usa la
 * convención OpenGL (cámara mirando hacia -z). El viewport debe describir la
 * imagen de cámara (`view.camera.width × view.camera.height`), no la capa XR.
 *
 * El explainer devuelve `v0` con origen abajo a la izquierda porque la textura
 * de cámara de WebXR usa ese origen. OpenCV, en cambio, usa píxeles con origen
 * arriba a la izquierda; por eso la opción por defecto refleja `cy`.
 *
 * Fórmulas (p = projectionMatrix, vp = viewport):
 *   fx    = vp.width / 2 * p[0]
 *   fy    = vp.height / 2 * p[5]
 *   skew  = vp.width / 2 * p[4]
 *   cx    = (1 - p[8]) * vp.width / 2 + vp.x
 *   cy_b  = (1 - p[9]) * vp.height / 2 + vp.y   (origen abajo)
 *   cy_tl = vp.y + vp.height - (1 - p[9]) * vp.height / 2 (origen arriba)
 */
import type { CameraIntrinsics } from '../messages/schemas';

export type ImageSize = readonly [number, number];

export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IntrinsicsWithSkew extends CameraIntrinsics {
  /** Factor de sesgo en píxeles; normalmente 0. */
  skew: number;
}

export type PixelOrigin = 'top-left' | 'bottom-left';

export interface IntrinsicsOptions {
  /** Origen de píxeles del resultado. Por defecto `top-left` (OpenCV). */
  origin?: PixelOrigin;
}

/**
 * Deriva los intrínsecos de una matriz de proyección WebXR.
 *
 * @throws Si la matriz o el viewport son inválidos, o si la proyección no
 *   tiene focales positivas.
 */
export function intrinsicsFromProjectionMatrix(
  projection: ArrayLike<number>,
  viewport: ViewportRect,
  options: IntrinsicsOptions = {},
): IntrinsicsWithSkew {
  if (projection.length < 16) {
    throw new Error(`La matriz de proyección debe tener 16 elementos, no ${projection.length}`);
  }
  for (const index of [0, 4, 5, 8, 9]) {
    assertFinite(`projection[${index}]`, projection[index]);
  }
  validateViewport(viewport);

  const p0 = projection[0];
  const p4 = projection[4];
  const p5 = projection[5];
  const p8 = projection[8];
  const p9 = projection[9];

  if (!(p0 > 0) || !(p5 > 0)) {
    throw new Error(`La proyección debe tener focales positivas (p[0]=${p0}, p[5]=${p5})`);
  }

  const fx = (viewport.width / 2) * p0;
  const fy = (viewport.height / 2) * p5;
  const skew = (viewport.width / 2) * p4;
  const cx = ((1 - p8) * viewport.width) / 2 + viewport.x;

  const cyFromBottom = ((1 - p9) * viewport.height) / 2 + viewport.y;
  const cy =
    (options.origin ?? 'top-left') === 'bottom-left'
      ? cyFromBottom
      : viewport.y + viewport.height - (cyFromBottom - viewport.y);

  const result: IntrinsicsWithSkew = { fx, fy, cx, cy, skew };
  for (const [name, value] of Object.entries(result)) {
    assertFinite(`intrínseco ${name}`, value);
  }
  if (!(fx > 0) || !(fy > 0)) {
    throw new Error(`Intrínsecos inválidos: fx=${fx}, fy=${fy}`);
  }
  return result;
}

/** Escala focales y centro principal a otra resolución. */
export function scaleIntrinsics(
  intrinsics: CameraIntrinsics,
  scaleX: number,
  scaleY: number = scaleX,
): CameraIntrinsics {
  validateScale(scaleX, 'scaleX');
  validateScale(scaleY, 'scaleY');
  const result: CameraIntrinsics = {
    fx: intrinsics.fx * scaleX,
    fy: intrinsics.fy * scaleY,
    cx: intrinsics.cx * scaleX,
    cy: intrinsics.cy * scaleY,
  };
  for (const [name, value] of Object.entries(result)) {
    assertFinite(`intrínseco escalado ${name}`, value);
  }
  return result;
}

/** Variante de `scaleIntrinsics` que conserva y escala el sesgo. */
export function scaleIntrinsicsWithSkew(
  intrinsics: IntrinsicsWithSkew,
  scaleX: number,
  scaleY: number = scaleX,
): IntrinsicsWithSkew {
  const scaled = scaleIntrinsics(intrinsics, scaleX, scaleY);
  return { ...scaled, skew: intrinsics.skew * scaleX };
}

/** Escala intrínsecos definidos para `from` a la resolución `to`. */
export function scaleIntrinsicsToSize(
  intrinsics: CameraIntrinsics,
  from: ImageSize,
  to: ImageSize,
): CameraIntrinsics {
  validateImageSize(from, 'from');
  validateImageSize(to, 'to');
  return scaleIntrinsics(intrinsics, to[0] / from[0], to[1] / from[1]);
}

function validateViewport(viewport: ViewportRect): void {
  assertFinite('viewport.x', viewport.x);
  assertFinite('viewport.y', viewport.y);
  assertFinite('viewport.width', viewport.width);
  assertFinite('viewport.height', viewport.height);
  if (!(viewport.width > 0) || !(viewport.height > 0)) {
    throw new Error(
      `El viewport debe tener ancho y alto positivos (${viewport.width}×${viewport.height})`,
    );
  }
}

function validateImageSize(size: ImageSize, name: string): void {
  if (!Number.isInteger(size[0]) || !Number.isInteger(size[1]) || size[0] <= 0 || size[1] <= 0) {
    throw new Error(`Tamaño de imagen ${name} inválido: [${size[0]}, ${size[1]}]`);
  }
}

function validateScale(value: number, name: string): void {
  assertFinite(name, value);
  if (!(value > 0)) {
    throw new Error(`${name} debe ser positivo, no ${value}`);
  }
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} no es finito: ${value}`);
  }
}
