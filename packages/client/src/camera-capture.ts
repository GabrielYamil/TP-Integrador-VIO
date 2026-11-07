/**
 * Captura de la textura de cámara WebXR y conversión a gris (Fase 4).
 *
 * `XRWebGLBinding.getCameraImage(view.camera)` devuelve una textura opaca con
 * origen abajo a la izquierda. Para no leer la resolución completa de la cámara
 * en la CPU, se dibuja la textura en un framebuffer propio, del tamaño reducido
 * configurado, y recién entonces se hace `readPixels`.
 *
 * El shader muestrea la textura con `v = 1 - v`. Así la primera fila que
 * devuelve `readPixels` (el borde inferior del framebuffer) corresponde al borde
 * superior de la imagen. El buffer en gris queda en orden row-major con origen
 * arriba a la izquierda, listo para OpenCV y para el futuro Web Worker.
 *
 * Referencias:
 * - https://immersive-web.github.io/raw-camera-access/
 * - Ejemplo camera-access-barebones de Chromium, que advierte el origen
 *   bottom-left de la textura y el readback con un framebuffer.
 */
import type { CameraCalibration, CameraIntrinsics } from '@vio/shared';
import {
  calibrationIntrinsicsForSize,
  intrinsicsFromProjectionMatrix,
  scaleIntrinsicsWithSkew,
} from '@vio/shared';

export interface XRCameraLike {
  readonly width: number;
  readonly height: number;
}

export type XRViewWithCamera = XRView & { readonly camera?: XRCameraLike | null };

export interface CameraBindingLike {
  getCameraImage(camera: XRCameraLike): WebGLTexture | null;
}

export type CameraBindingCtor = new (
  session: XRSession,
  context: WebGL2RenderingContext,
) => CameraBindingLike;

export interface CaptureSize {
  width: number;
  height: number;
}

export interface CameraFrame {
  /** Resolución de la imagen procesada. */
  width: number;
  height: number;
  /** Resolución original de la textura de cámara. */
  sourceWidth: number;
  sourceHeight: number;
  /** Gris row-major, origen arriba a la izquierda, válido hasta la próxima captura. */
  gray: Uint8Array;
  /** RGBA con R=G=B=gris, útil para la vista previa. Misma vigencia que `gray`. */
  rgba: Uint8Array;
  /** Intrínsecos para `width × height`, ya con origen arriba a la izquierda. */
  intrinsics: CameraIntrinsics;
  /** Sesgo en píxeles de la proyección; normalmente 0. */
  skew: number;
}

export interface CameraFrameGrabberOptions {
  maxDimension: number;
  calibration?: CameraCalibration | null;
}

/**
 * Calcula el tamaño procesado preservando la relación de aspecto y sin
 * ampliar la imagen original. El lado mayor queda acotado por `maxDimension`;
 * así una imagen vertical tampoco supera el presupuesto de procesamiento.
 */
export function computeCaptureSize(
  sourceWidth: number,
  sourceHeight: number,
  maxDimension: number,
): CaptureSize {
  if (!Number.isInteger(sourceWidth) || sourceWidth <= 0) {
    throw new Error(`Ancho de cámara inválido: ${sourceWidth}`);
  }
  if (!Number.isInteger(sourceHeight) || sourceHeight <= 0) {
    throw new Error(`Alto de cámara inválido: ${sourceHeight}`);
  }
  if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
    throw new Error(`Tamaño máximo inválido: ${maxDimension}`);
  }

  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

/**
 * Crea el binding de WebXR Layers que expone `getCameraImage`. Devuelve null si
 * el navegador no expone `XRWebGLBinding`, sin lanzar.
 */
export function createCameraBinding(
  session: XRSession,
  gl: WebGL2RenderingContext,
): CameraBindingLike | null {
  const ctor = (globalThis as { XRWebGLBinding?: CameraBindingCtor }).XRWebGLBinding;
  if (!ctor) {
    return null;
  }
  return new ctor(session, gl);
}

const VERTEX_SHADER = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = pos;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_camera;
in vec2 v_uv;
out vec4 out_color;
void main() {
  // La textura WebXR tiene origen abajo; el framebuffer y readPixels, también.
  // Al invertir v, la primera fila leída queda como borde superior.
  vec3 rgb = texture(u_camera, vec2(v_uv.x, 1.0 - v_uv.y)).rgb;
  float gray = dot(rgb, vec3(0.299, 0.587, 0.114));
  out_color = vec4(gray, gray, gray, 1.0);
}
`;

export class CameraFrameGrabber {
  readonly #gl: WebGL2RenderingContext;
  readonly #binding: CameraBindingLike;
  readonly #maxDimension: number;
  #calibration: CameraCalibration | null;
  #program: WebGLProgram;
  #vao: WebGLVertexArrayObject;
  #uniformCamera: WebGLUniformLocation;
  #framebuffer: WebGLFramebuffer | null = null;
  #targetTexture: WebGLTexture | null = null;
  #targetWidth = 0;
  #targetHeight = 0;
  #rgba = new Uint8Array(0);
  #gray = new Uint8Array(0);

  constructor(
    gl: WebGL2RenderingContext,
    binding: CameraBindingLike,
    options: CameraFrameGrabberOptions,
  ) {
    this.#gl = gl;
    this.#binding = binding;
    this.#maxDimension = options.maxDimension;
    this.#calibration = options.calibration ?? null;
    this.#program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);

    const uniform = gl.getUniformLocation(this.#program, 'u_camera');
    if (!uniform) {
      gl.deleteProgram(this.#program);
      throw new Error('El shader de cámara no expone u_camera');
    }
    this.#uniformCamera = uniform;

    const vao = gl.createVertexArray();
    if (!vao) {
      gl.deleteProgram(this.#program);
      throw new Error('No se pudo crear el VAO de captura');
    }
    this.#vao = vao;
  }

  get width(): number {
    return this.#targetWidth;
  }

  get height(): number {
    return this.#targetHeight;
  }

  setCalibration(calibration: CameraCalibration | null): void {
    this.#calibration = calibration;
  }

  /**
   * Captura y procesa la imagen de cámara del frame XR actual.
   *
   * Debe llamarse dentro del callback de `requestAnimationFrame` de la sesión,
   * mientras el `XRFrame` está activo.
   */
  capture(view: XRViewWithCamera, camera: XRCameraLike): CameraFrame {
    const gl = this.#gl;
    const sourceWidth = camera.width;
    const sourceHeight = camera.height;
    const size = computeCaptureSize(sourceWidth, sourceHeight, this.#maxDimension);

    const texture = this.#binding.getCameraImage(camera);
    if (!texture) {
      throw new Error('getCameraImage devolvió null');
    }
    if (!gl.isTexture(texture)) {
      throw new Error('getCameraImage no devolvió una WebGLTexture válida');
    }

    const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const previousViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

    this.#ensureTarget(size.width, size.height);

    try {
      // Vaciar errores previos del contexto para no atribuirlos a readPixels.
      // El límite evita un bucle si el contexto se perdió y getError devuelve
      // CONTEXT_LOST_WEBGL de forma permanente.
      for (let i = 0; i < 8; i += 1) {
        if (gl.getError() === gl.NO_ERROR) {
          break;
        }
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.#framebuffer);
      gl.viewport(0, 0, size.width, size.height);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);

      gl.useProgram(this.#program);
      gl.bindVertexArray(this.#vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(this.#uniformCamera, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.readPixels(0, 0, size.width, size.height, gl.RGBA, gl.UNSIGNED_BYTE, this.#rgba);
      const error = gl.getError();
      if (error !== gl.NO_ERROR) {
        throw new Error(`readPixels falló con el error WebGL 0x${error.toString(16)}`);
      }
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
      gl.viewport(
        previousViewport[0],
        previousViewport[1],
        previousViewport[2],
        previousViewport[3],
      );
      gl.bindVertexArray(null);
    }

    // El shader ya escribió gris en RGB y alfa 255. Alcanza con tomar R.
    for (let source = 0, target = 0; target < this.#gray.length; source += 4, target += 1) {
      this.#gray[target] = this.#rgba[source];
    }

    const derived = intrinsicsFromProjectionMatrix(
      view.projectionMatrix,
      { x: 0, y: 0, width: sourceWidth, height: sourceHeight },
      { origin: 'top-left' },
    );
    const scaledDerived = scaleIntrinsicsWithSkew(
      derived,
      size.width / sourceWidth,
      size.height / sourceHeight,
    );
    const intrinsics = this.#calibration
      ? calibrationIntrinsicsForSize(this.#calibration, size.width, size.height)
      : {
          fx: scaledDerived.fx,
          fy: scaledDerived.fy,
          cx: scaledDerived.cx,
          cy: scaledDerived.cy,
        };

    return {
      width: size.width,
      height: size.height,
      sourceWidth,
      sourceHeight,
      gray: this.#gray,
      rgba: this.#rgba,
      intrinsics,
      // La calibración no incluye skew; se asume cero en ese modo.
      skew: this.#calibration ? 0 : scaledDerived.skew,
    };
  }

  dispose(): void {
    const gl = this.#gl;
    gl.deleteProgram(this.#program);
    gl.deleteVertexArray(this.#vao);
    this.#deleteTarget();
  }

  #ensureTarget(width: number, height: number): void {
    if (this.#framebuffer && this.#targetWidth === width && this.#targetHeight === height) {
      return;
    }
    this.#deleteTarget();

    const gl = this.#gl;
    const texture = gl.createTexture();
    if (!texture) {
      throw new Error('No se pudo crear la textura de captura');
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) {
      gl.deleteTexture(texture);
      throw new Error('No se pudo crear el framebuffer de captura');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      throw new Error(`Framebuffer de captura incompleto (0x${status.toString(16)})`);
    }

    this.#targetTexture = texture;
    this.#framebuffer = framebuffer;
    this.#targetWidth = width;
    this.#targetHeight = height;
    this.#rgba = new Uint8Array(width * height * 4);
    this.#gray = new Uint8Array(width * height);
  }

  #deleteTarget(): void {
    const gl = this.#gl;
    if (this.#framebuffer) {
      gl.deleteFramebuffer(this.#framebuffer);
      this.#framebuffer = null;
    }
    if (this.#targetTexture) {
      gl.deleteTexture(this.#targetTexture);
      this.#targetTexture = null;
    }
    this.#targetWidth = 0;
    this.#targetHeight = 0;
  }
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new Error('No se pudo crear el programa WebGL');
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? '(sin log)';
    gl.deleteProgram(program);
    throw new Error(`No se pudo enlazar el programa de cámara: ${log}`);
  }
  return program;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('No se pudo crear el shader de cámara');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '(sin log)';
    gl.deleteShader(shader);
    throw new Error(`No se pudo compilar el shader de cámara: ${log}`);
  }
  return shader;
}
