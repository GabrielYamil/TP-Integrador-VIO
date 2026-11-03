import { poseFromWebXRMatrix, poseToString } from '@vio/shared';
import { byId, copyText, flashButton } from './ui';

type TrackingState = 'unknown' | 'tracking' | 'limited' | 'lost';
type CameraAccessState = 'unknown' | 'enabled' | 'unavailable' | 'error';

interface XRCameraLike {
  width?: number;
  height?: number;
}

type XRViewWithCamera = XRView & { camera?: XRCameraLike };

interface CameraAccessBinding {
  getCameraImage(camera: XRCameraLike): WebGLTexture | null;
}

type CameraAccessBindingCtor = new (
  session: XRSession,
  context: WebGL2RenderingContext,
) => CameraAccessBinding;

interface ArReport {
  generatedAt: string;
  url: string;
  secureContext: boolean;
  userAgent: string;
  immersiveArSupported: boolean | null;
  sessionStarted: boolean;
  enabledFeatures: string[];
  referenceSpace: string | null;
  tracking: TrackingState;
  cameraAccess: CameraAccessState;
  cameraImage: { width: number | null; height: number | null } | null;
  frames: number;
  fps: number;
  lastPose: string | null;
  errors: string[];
}

const report: ArReport = {
  generatedAt: new Date().toISOString(),
  url: window.location.href,
  secureContext: window.isSecureContext,
  userAgent: navigator.userAgent,
  immersiveArSupported: null,
  sessionStarted: false,
  enabledFeatures: [],
  referenceSpace: null,
  tracking: 'unknown',
  cameraAccess: 'unknown',
  cameraImage: null,
  frames: 0,
  fps: 0,
  lastPose: null,
  errors: [],
};

const canvas = byId<HTMLCanvasElement>('xr-canvas');
const overlay = byId<HTMLDivElement>('overlay');
const reticle = byId<HTMLDivElement>('reticle');
const startButton = byId<HTMLButtonElement>('start');
const stopButton = byId<HTMLButtonElement>('stop');
const overlayStopButton = byId<HTMLButtonElement>('overlay-stop');
const copyButton = byId<HTMLButtonElement>('copy');
const reportEl = byId<HTMLPreElement>('report');
const logEl = byId<HTMLDivElement>('log');
const sessionStateEl = byId<HTMLSpanElement>('session-state');
const secureStateEl = byId<HTMLSpanElement>('secure-state');
const supportStateEl = byId<HTMLSpanElement>('support-state');
const overlayTrackingEl = byId<HTMLElement>('overlay-tracking');
const overlayFpsEl = byId<HTMLElement>('overlay-fps');
const overlayCameraEl = byId<HTMLElement>('overlay-camera');
const overlayFeaturesEl = byId<HTMLElement>('overlay-features');

let session: XRSession | null = null;
let referenceSpace: XRReferenceSpace | null = null;
let gl: WebGL2RenderingContext | null = null;
let layer: XRWebGLLayer | null = null;
let binding: CameraAccessBinding | null = null;
let frameCount = 0;
let fpsFrameCount = 0;
let lastFpsTime = 0;
let lastUiTime = 0;
let nullPoseFrames = 0;
let cameraProbeAttempts = 0;
let logLines = 0;

function appendError(message: string): void {
  report.errors.push(message);
  if (report.errors.length > 20) {
    report.errors.shift();
  }
}

function log(message: string, level: 'info' | 'ok' | 'warn' | 'error' = 'info'): void {
  const line = document.createElement('div');
  line.className = 'log-line';
  line.dataset.level = level;

  const time = document.createElement('span');
  time.className = 'log-time';
  time.textContent = new Date().toLocaleTimeString('es-AR', { hour12: false });

  const body = document.createElement('span');
  body.className = 'log-message';
  body.textContent = message;

  line.append(time, body);
  logEl.append(line);
  logEl.scrollTop = logEl.scrollHeight;
  logLines += 1;
  if (logLines > 250) {
    logEl.firstElementChild?.remove();
    logLines -= 1;
  }
  if (level === 'error') {
    appendError(message);
  }
}

function setPill(
  element: HTMLElement,
  text: string,
  status: 'ok' | 'warn' | 'fail' | 'pending',
): void {
  element.textContent = text;
  element.dataset.status = status;
}

function updateOverlay(): void {
  overlayTrackingEl.textContent = report.tracking;
  overlayFpsEl.textContent = report.fps.toFixed(1);
  overlayCameraEl.textContent =
    report.cameraAccess === 'enabled'
      ? `OK (${report.cameraImage?.width ?? '?'}×${report.cameraImage?.height ?? '?'})`
      : report.cameraAccess;
  overlayFeaturesEl.textContent = `Features: ${
    report.enabledFeatures.length > 0 ? report.enabledFeatures.join(', ') : '—'
  }`;
}

function updateUi(): void {
  report.generatedAt = new Date().toISOString();
  reportEl.textContent = JSON.stringify(report, null, 2);

  setPill(
    sessionStateEl,
    `Sesión: ${report.sessionStarted ? 'activa' : 'inactiva'}`,
    report.sessionStarted ? 'ok' : 'pending',
  );
  setPill(
    secureStateEl,
    `HTTPS: ${report.secureContext ? 'sí' : 'no'}`,
    report.secureContext ? 'ok' : 'fail',
  );
  setPill(
    supportStateEl,
    `immersive-ar: ${
      report.immersiveArSupported === null
        ? 'consultando'
        : report.immersiveArSupported
          ? 'soportado'
          : 'no soportado'
    }`,
    report.immersiveArSupported === null ? 'pending' : report.immersiveArSupported ? 'ok' : 'fail',
  );

  updateOverlay();
}

async function requestReferenceSpace(current: XRSession): Promise<XRReferenceSpace> {
  const candidates: XRReferenceSpaceType[] = ['local-floor', 'local', 'viewer'];
  for (const type of candidates) {
    try {
      const space = await current.requestReferenceSpace(type);
      report.referenceSpace = type;
      log(`Reference space: ${type}`, 'ok');
      return space;
    } catch {
      log(`Reference space ${type} no disponible`, 'warn');
    }
  }
  throw new Error('No se pudo obtener ningún reference space');
}

function createBinding(current: XRSession): CameraAccessBinding | null {
  const BindingCtor = (window as unknown as { XRWebGLBinding?: CameraAccessBindingCtor })
    .XRWebGLBinding;
  if (!BindingCtor) {
    log('XRWebGLBinding no está expuesto por el navegador', 'warn');
    report.cameraAccess = 'unavailable';
    return null;
  }
  try {
    return new BindingCtor(current, gl as WebGL2RenderingContext);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`No se pudo crear XRWebGLBinding: ${message}`, 'error');
    report.cameraAccess = 'error';
    return null;
  }
}

function probeCameraAccess(viewerPose: XRViewerPose): void {
  if (!binding || !gl || report.cameraAccess !== 'unknown' || cameraProbeAttempts >= 120) {
    return;
  }
  cameraProbeAttempts += 1;

  for (const view of viewerPose.views) {
    const camera = (view as XRViewWithCamera).camera;
    if (!camera) {
      continue;
    }
    try {
      const texture = binding.getCameraImage(camera);
      if (texture && gl.isTexture(texture)) {
        report.cameraAccess = 'enabled';
        report.cameraImage = {
          width: camera.width ?? null,
          height: camera.height ?? null,
        };
        log(`camera-access OK: textura ${camera.width ?? '?'}×${camera.height ?? '?'}`, 'ok');
        updateUi();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.cameraAccess = 'error';
      log(`getCameraImage falló: ${message}`, 'error');
      updateUi();
    }
    return;
  }

  if (cameraProbeAttempts >= 120 && report.cameraAccess === 'unknown') {
    report.cameraAccess = 'unavailable';
    log(
      'No se obtuvo textura de cámara. camera-access puede no estar disponible en este dispositivo.',
      'warn',
    );
    updateUi();
  }
}

function onFrame(time: number, frame: XRFrame): void {
  if (!session || !referenceSpace || !gl || !layer) {
    return;
  }

  frameCount += 1;
  fpsFrameCount += 1;
  report.frames = frameCount;

  let viewerPose: XRViewerPose | null = null;
  try {
    viewerPose = frame.getViewerPose(referenceSpace) ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`getViewerPose falló: ${message}`, 'error');
  }

  if (viewerPose) {
    report.tracking = 'tracking';
    nullPoseFrames = 0;
    try {
      report.lastPose = poseToString(poseFromWebXRMatrix(viewerPose.transform.matrix));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`No se pudo convertir la pose WebXR: ${message}`, 'error');
    }
    probeCameraAccess(viewerPose);
  } else {
    nullPoseFrames += 1;
    report.tracking = nullPoseFrames > 30 ? 'lost' : 'limited';
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
  gl.disable(gl.SCISSOR_TEST);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  if (lastFpsTime === 0) {
    lastFpsTime = time;
  }
  const elapsed = time - lastFpsTime;
  if (elapsed >= 500) {
    report.fps = (fpsFrameCount * 1000) / elapsed;
    fpsFrameCount = 0;
    lastFpsTime = time;
  }

  if (lastUiTime === 0 || time - lastUiTime >= 250) {
    lastUiTime = time;
    updateUi();
  }

  session.requestAnimationFrame(onFrame);
}

function onSessionEnd(): void {
  log('Sesión terminada', 'info');
  if (session) {
    session.removeEventListener('end', onSessionEnd);
  }
  session = null;
  referenceSpace = null;
  binding = null;
  layer = null;
  report.sessionStarted = false;
  report.tracking = 'unknown';
  report.fps = 0;
  overlay.hidden = true;
  reticle.hidden = true;
  startButton.disabled = report.immersiveArSupported === false || !report.secureContext;
  stopButton.disabled = true;
  overlayStopButton.disabled = true;
  updateUi();
}

async function startSession(): Promise<void> {
  if (session) {
    return;
  }
  const xr = 'xr' in navigator ? navigator.xr : undefined;
  if (!xr) {
    log('navigator.xr no está disponible', 'error');
    return;
  }
  if (!report.secureContext) {
    log('WebXR exige un contexto seguro (HTTPS)', 'error');
    return;
  }

  startButton.disabled = true;
  stopButton.disabled = true;
  overlayStopButton.disabled = true;
  report.cameraAccess = 'unknown';
  report.cameraImage = null;
  report.enabledFeatures = [];
  report.errors = [];
  report.frames = 0;
  cameraProbeAttempts = 0;
  nullPoseFrames = 0;
  frameCount = 0;
  fpsFrameCount = 0;
  lastFpsTime = 0;
  lastUiTime = 0;

  try {
    if (!gl) {
      const attributes = {
        alpha: true,
        antialias: false,
        depth: true,
        stencil: false,
        premultipliedAlpha: false,
        xrCompatible: true,
      } as WebGLContextAttributes;
      gl = canvas.getContext('webgl2', attributes);
    }
    if (!gl) {
      throw new Error('No se pudo crear un contexto WebGL2');
    }

    overlay.hidden = false;
    reticle.hidden = false;
    const current = await xr.requestSession('immersive-ar', {
      optionalFeatures: ['local-floor', 'camera-access', 'dom-overlay'],
      domOverlay: { root: overlay },
    });
    session = current;
    report.sessionStarted = true;

    const enabled = (current as XRSession & { enabledFeatures?: readonly string[] })
      .enabledFeatures;
    report.enabledFeatures = enabled ? Array.from(enabled) : [];
    log(
      `Sesión iniciada. Features: ${
        report.enabledFeatures.length > 0 ? report.enabledFeatures.join(', ') : '(no expuesto)'
      }`,
      'ok',
    );

    current.addEventListener('end', onSessionEnd);
    referenceSpace = await requestReferenceSpace(current);

    layer = new XRWebGLLayer(current, gl);
    current.updateRenderState({ baseLayer: layer });

    if (report.enabledFeatures.length > 0 && !report.enabledFeatures.includes('camera-access')) {
      report.cameraAccess = 'unavailable';
      log('La sesión no habilitó camera-access', 'warn');
    } else {
      binding = createBinding(current);
    }

    stopButton.disabled = false;
    overlayStopButton.disabled = false;
    updateUi();
    current.requestAnimationFrame(onFrame);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`No se pudo iniciar la sesión AR: ${message}`, 'error');
    overlay.hidden = true;
    reticle.hidden = true;
    startButton.disabled = report.immersiveArSupported === false || !report.secureContext;
    stopButton.disabled = true;
    overlayStopButton.disabled = true;
    if (session) {
      try {
        await session.end();
      } catch {
        onSessionEnd();
      }
    } else {
      updateUi();
    }
  }
  updateUi();
}

async function stopSession(): Promise<void> {
  if (!session) {
    return;
  }
  stopButton.disabled = true;
  overlayStopButton.disabled = true;
  try {
    await session.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`No se pudo terminar la sesión: ${message}`, 'error');
    onSessionEnd();
  }
}

async function init(): Promise<void> {
  log(
    `Contexto seguro: ${report.secureContext ? 'sí' : 'no'}`,
    report.secureContext ? 'ok' : 'error',
  );
  if (!report.secureContext) {
    log('Abrí esta página por HTTPS para que WebXR funcione', 'error');
  }

  const xr = 'xr' in navigator ? navigator.xr : undefined;
  if (!xr) {
    report.immersiveArSupported = false;
    log('navigator.xr no existe: este navegador no soporta WebXR', 'error');
  } else {
    try {
      report.immersiveArSupported = await xr.isSessionSupported('immersive-ar');
      log(
        `Soporte immersive-ar: ${report.immersiveArSupported ? 'sí' : 'no'}`,
        report.immersiveArSupported ? 'ok' : 'error',
      );
    } catch (error) {
      report.immersiveArSupported = false;
      const message = error instanceof Error ? error.message : String(error);
      log(`isSessionSupported falló: ${message}`, 'error');
    }
  }

  startButton.disabled = report.immersiveArSupported === false || !report.secureContext;
  updateUi();
}

startButton.addEventListener('click', () => {
  void startSession();
});
stopButton.addEventListener('click', () => {
  void stopSession();
});
overlayStopButton.addEventListener('click', () => {
  void stopSession();
});
copyButton.addEventListener('click', () => {
  void (async () => {
    report.generatedAt = new Date().toISOString();
    const ok = await copyText(JSON.stringify(report, null, 2));
    flashButton(copyButton, ok ? 'Copiado' : 'No se pudo copiar');
  })();
});

void init();
