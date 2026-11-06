/**
 * Cliente AR de la Fase 3.
 *
 * Flujo:
 *   1. Comprobar HTTPS y `immersive-ar`.
 *   2. Abrir una sesión con `dom-overlay`, `local-floor` (fallback `local`) y
 *      `camera-access` opcional.
 *   3. En cada frame, convertir `XRViewerPose` a la convención de `shared`
 *      (marco `odom`) y enviar un mensaje `pose` al relay a `poseHz`.
 *   4. Mostrar tracking, FPS, estado del WebSocket y la posición en el overlay.
 *
 * El servidor deriva la pose corregida con `T_WORLD_ODOM_INITIAL`; el cliente
 * solo calcula `world` para mostrar la posición en pantalla. La corrección con
 * marcadores llega en la Fase 4.
 */
import type { Pose, PoseMessagePayload, TrackingState } from '@vio/shared';
import { compose, poseFromWebXRMatrix, worldFromOdomInitial } from '@vio/shared';
import { readRuntimeConfig } from './client-config';
import { byId, formatVector } from './ui';
import type { IngestConnectionState, IngestStats } from './ws-client';
import { IngestClient } from './ws-client';

type CameraFeatureState = 'unknown' | 'enabled' | 'unavailable';

type XRSessionWithFeatures = XRSession & { enabledFeatures?: readonly string[] };

type WebGLContextWithXR = WebGL2RenderingContext & {
  makeXRCompatible?: () => Promise<void>;
};

const config = readRuntimeConfig();

const canvas = byId<HTMLCanvasElement>('xr-canvas');
const overlay = byId<HTMLDivElement>('overlay');
const reticle = byId<HTMLDivElement>('reticle');
const startScreen = byId<HTMLElement>('start-screen');
const startButton = byId<HTMLButtonElement>('start');
const overlayStopButton = byId<HTMLButtonElement>('overlay-stop');
const logEl = byId<HTMLDivElement>('log');
const secureStateEl = byId<HTMLSpanElement>('secure-state');
const supportStateEl = byId<HTMLSpanElement>('support-state');
const sessionStateEl = byId<HTMLSpanElement>('session-state');
const ingestStateEl = byId<HTMLSpanElement>('ingest-state');
const ingestUrlEl = byId<HTMLElement>('ingest-url');
const poseHzEl = byId<HTMLElement>('pose-hz');
const foxgloveUrlEl = byId<HTMLElement>('foxglove-url');
const hintEl = byId<HTMLElement>('hint');
const overlayTrackingEl = byId<HTMLElement>('overlay-tracking');
const overlayFpsEl = byId<HTMLElement>('overlay-fps');
const overlayMarkersEl = byId<HTMLElement>('overlay-markers');
const overlayConnectionEl = byId<HTMLElement>('overlay-connection');
const overlaySentEl = byId<HTMLElement>('overlay-sent');
const overlayBufferedEl = byId<HTMLElement>('overlay-buffered');
const overlayCameraEl = byId<HTMLElement>('overlay-camera');
const overlayRawPEl = byId<HTMLElement>('overlay-raw-p');
const overlayWorldPEl = byId<HTMLElement>('overlay-world-p');

let session: XRSession | null = null;
let referenceSpace: XRReferenceSpace | null = null;
let gl: WebGL2RenderingContext | null = null;
let layer: XRWebGLLayer | null = null;
let supported: boolean | null = null;
let starting = false;
let sessionActive = false;
let tracking: TrackingState | 'unknown' = 'unknown';
let cameraFeature: CameraFeatureState = 'unknown';
let rawPose: Pose | null = null;
let worldPose: Pose | null = null;
let fps = 0;
let fpsFrameCount = 0;
let lastFpsTime = 0;
let lastUiTime = 0;
let lastPoseSentMs = -1;
let nullPoseFrames = 0;
let lastFrameErrorMs = 0;
let logLines = 0;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
}

function setPill(
  element: HTMLElement,
  text: string,
  status: 'ok' | 'warn' | 'fail' | 'pending',
): void {
  element.textContent = text;
  element.dataset.status = status;
}

function connectionLabel(state: IngestConnectionState): string {
  switch (state) {
    case 'idle':
      return 'inactivo';
    case 'connecting':
      return 'conectando…';
    case 'open':
      return 'conectado';
    case 'reconnecting':
      return 'reconectando…';
    case 'closed':
      return 'cerrado';
  }
}

function connectionPillStatus(state: IngestConnectionState): 'ok' | 'warn' | 'fail' | 'pending' {
  if (state === 'open') {
    return 'ok';
  }
  if (state === 'connecting' || state === 'reconnecting') {
    return 'warn';
  }
  return state === 'idle' ? 'pending' : 'fail';
}

function connectionClass(state: IngestConnectionState): string {
  if (state === 'open') {
    return 'ok';
  }
  if (state === 'connecting' || state === 'reconnecting') {
    return 'warn';
  }
  return 'bad';
}

function trackingClass(state: TrackingState | 'unknown'): string {
  if (state === 'tracking') {
    return 'ok';
  }
  if (state === 'limited') {
    return 'warn';
  }
  return state === 'lost' ? 'bad' : '';
}

function cameraLabel(state: CameraFeatureState): string {
  if (state === 'enabled') {
    return 'habilitada';
  }
  return state === 'unavailable' ? 'no habilitada' : '—';
}

function sessionLabel(): string {
  if (sessionActive) {
    return 'activa';
  }
  return starting ? 'iniciando…' : 'inactiva';
}

function updateUi(): void {
  const stats: IngestStats = ingest.getStats();

  setPill(
    secureStateEl,
    `HTTPS: ${window.isSecureContext ? 'sí' : 'no'}`,
    window.isSecureContext ? 'ok' : 'fail',
  );
  setPill(
    supportStateEl,
    `immersive-ar: ${
      supported === null ? 'consultando' : supported ? 'soportado' : 'no soportado'
    }`,
    supported === null ? 'pending' : supported ? 'ok' : 'fail',
  );
  setPill(
    sessionStateEl,
    `Sesión: ${sessionLabel()}`,
    sessionActive ? 'ok' : starting ? 'warn' : 'pending',
  );
  setPill(
    ingestStateEl,
    `Relay: ${connectionLabel(stats.state)}`,
    connectionPillStatus(stats.state),
  );

  overlayTrackingEl.textContent = tracking;
  overlayTrackingEl.className = trackingClass(tracking);
  overlayFpsEl.textContent = fps.toFixed(1);
  overlayMarkersEl.textContent = '0';
  overlayConnectionEl.textContent = connectionLabel(stats.state);
  overlayConnectionEl.className = connectionClass(stats.state);
  overlaySentEl.textContent = String(stats.sent);
  overlayBufferedEl.textContent = String(stats.buffered);
  overlayCameraEl.textContent = cameraLabel(cameraFeature);
  overlayCameraEl.className =
    cameraFeature === 'enabled' ? 'ok' : cameraFeature === 'unavailable' ? 'warn' : '';
  overlayRawPEl.textContent = rawPose ? formatVector(rawPose.p) : '—';
  overlayWorldPEl.textContent = worldPose ? formatVector(worldPose.p) : '—';
}

const ingest = new IngestClient(config.ingestUrl, {
  onStateChange: () => {
    updateUi();
  },
  logger: (message, level = 'info') => {
    log(message, level);
  },
});

function describeSessionError(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotSupportedError':
        return 'El dispositivo no soporta immersive-ar o le falta ARCore.';
      case 'NotAllowedError':
        return 'El navegador o el sistema denegaron el permiso de AR. Revisá los permisos de Chrome y de la cámara.';
      case 'SecurityError':
        return 'La sesión AR exige HTTPS con un certificado confiable.';
      case 'InvalidStateError':
        return 'La sesión no está en un estado válido; recargá la página.';
      default:
        return `${error.name}: ${error.message}`;
    }
  }
  return errorMessage(error);
}

async function requestReferenceSpace(current: XRSession): Promise<XRReferenceSpace> {
  for (const type of ['local-floor', 'local'] as const) {
    try {
      const space = await current.requestReferenceSpace(type);
      log(`Reference space: ${type}`, 'ok');
      return space;
    } catch {
      log(`Reference space ${type} no disponible; se prueba el siguiente`, 'warn');
    }
  }
  throw new Error('No se pudo obtener local-floor ni local');
}

function renderClear(): void {
  if (!gl || !layer) {
    return;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
  gl.disable(gl.SCISSOR_TEST);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

function processFrame(time: number, frame: XRFrame): void {
  if (!referenceSpace) {
    return;
  }

  const viewerPose = frame.getViewerPose(referenceSpace);
  if (viewerPose) {
    nullPoseFrames = 0;
    const nextTracking: TrackingState = viewerPose.emulatedPosition ? 'limited' : 'tracking';
    tracking = nextTracking;

    const raw = poseFromWebXRMatrix(viewerPose.transform.matrix);
    rawPose = raw;
    worldPose = compose(worldFromOdomInitial(), raw);

    const sendIntervalMs = 1000 / config.poseHz;
    // Tolerancia del 10 % para no perder un envío por el jitter del frame.
    if (lastPoseSentMs < 0 || time - lastPoseSentMs >= sendIntervalMs * 0.9) {
      lastPoseSentMs = time;
      const message: PoseMessagePayload = {
        type: 'pose',
        // XRFrame.time usa la misma base que performance.now(). Se convierte a
        // milisegundos de época para conservar el reloj del celular.
        t: performance.timeOrigin + time,
        raw,
        tracking: nextTracking,
      };
      ingest.send(message);
    }
  } else {
    nullPoseFrames += 1;
    tracking = nullPoseFrames > config.trackingLostFrames ? 'lost' : 'limited';
  }

  renderClear();

  fpsFrameCount += 1;
  if (lastFpsTime === 0) {
    lastFpsTime = time;
  }
  const elapsed = time - lastFpsTime;
  if (elapsed >= config.statsWindowMs) {
    fps = (fpsFrameCount * 1000) / elapsed;
    fpsFrameCount = 0;
    lastFpsTime = time;
  }

  if (lastUiTime === 0 || time - lastUiTime >= config.uiIntervalMs) {
    lastUiTime = time;
    updateUi();
  }
}

function onFrame(time: number, frame: XRFrame): void {
  const current = session;
  if (!current || !referenceSpace) {
    return;
  }

  try {
    processFrame(time, frame);
  } catch (error) {
    if (time - lastFrameErrorMs > 1000) {
      lastFrameErrorMs = time;
      log(`Error procesando el frame XR: ${errorMessage(error)}`, 'error');
    }
  }

  if (session === current) {
    current.requestAnimationFrame(onFrame);
  }
}

function onSessionEnd(): void {
  const current = session;
  if (!current && !sessionActive) {
    return;
  }

  session = null;
  sessionActive = false;
  starting = false;
  referenceSpace = null;
  layer = null;
  tracking = 'unknown';
  cameraFeature = 'unknown';
  rawPose = null;
  worldPose = null;
  fps = 0;

  if (current) {
    current.removeEventListener('end', onSessionEnd);
  }

  overlay.hidden = true;
  reticle.hidden = true;
  startScreen.hidden = false;
  overlayStopButton.disabled = true;
  document.body.classList.remove('session-active');
  startButton.disabled = !(window.isSecureContext && supported === true);

  log('Sesión AR finalizada', 'info');
  updateUi();
}

async function startSession(): Promise<void> {
  if (session || starting) {
    return;
  }
  const xr = 'xr' in navigator ? navigator.xr : undefined;
  if (!xr) {
    log('navigator.xr no está disponible', 'error');
    return;
  }
  if (!window.isSecureContext) {
    log('WebXR exige un contexto seguro (HTTPS)', 'error');
    return;
  }
  if (supported !== true) {
    log('Este dispositivo no soporta immersive-ar', 'error');
    return;
  }

  starting = true;
  startButton.disabled = true;
  overlayStopButton.disabled = true;
  tracking = 'unknown';
  cameraFeature = 'unknown';
  rawPose = null;
  worldPose = null;
  fps = 0;
  fpsFrameCount = 0;
  lastFpsTime = 0;
  lastUiTime = 0;
  lastPoseSentMs = -1;
  nullPoseFrames = 0;
  lastFrameErrorMs = 0;
  updateUi();

  // El root de dom-overlay debe estar visible al pedir la sesión.
  overlay.hidden = false;

  let current: XRSession | null = null;
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
    await (gl as WebGLContextWithXR).makeXRCompatible?.();

    current = await xr.requestSession('immersive-ar', {
      optionalFeatures: ['local-floor', 'camera-access', 'dom-overlay'],
      domOverlay: { root: overlay },
    });
    session = current;

    const enabledFeatures = (current as XRSessionWithFeatures).enabledFeatures;
    const features = enabledFeatures ? Array.from(enabledFeatures) : [];
    log(
      `Sesión iniciada. Features: ${features.length > 0 ? features.join(', ') : '(no expuesto)'}`,
      'ok',
    );
    if (features.length > 0 && !features.includes('local-floor')) {
      log('local-floor no habilitado; se usará local como referencia', 'warn');
    }
    cameraFeature = features.includes('camera-access') ? 'enabled' : 'unavailable';
    if (cameraFeature === 'unavailable') {
      log('camera-access no está disponible; la Fase 4 quedará bloqueada', 'warn');
    }

    current.addEventListener('end', onSessionEnd);
    const space = await requestReferenceSpace(current);
    if (session !== current) {
      return;
    }
    referenceSpace = space;

    layer = new XRWebGLLayer(current, gl);
    current.updateRenderState({ baseLayer: layer });
    if (session !== current) {
      return;
    }

    starting = false;
    sessionActive = true;
    startScreen.hidden = true;
    reticle.hidden = false;
    overlayStopButton.disabled = false;
    document.body.classList.add('session-active');
    updateUi();

    current.requestAnimationFrame(onFrame);
  } catch (error) {
    starting = false;
    sessionActive = false;
    log(`No se pudo iniciar la sesión AR: ${describeSessionError(error)}`, 'error');
    overlay.hidden = true;
    reticle.hidden = true;
    startScreen.hidden = false;
    overlayStopButton.disabled = true;
    document.body.classList.remove('session-active');
    startButton.disabled = !(window.isSecureContext && supported === true);

    if (session) {
      try {
        await session.end();
      } catch {
        onSessionEnd();
      }
    } else if (current) {
      try {
        await current.end();
      } catch {
        onSessionEnd();
      }
    } else {
      updateUi();
    }
  }
}

async function stopSession(): Promise<void> {
  if (!session) {
    return;
  }
  overlayStopButton.disabled = true;
  try {
    await session.end();
  } catch (error) {
    log(`No se pudo terminar la sesión: ${errorMessage(error)}`, 'error');
    onSessionEnd();
  }
}

async function init(): Promise<void> {
  ingestUrlEl.textContent = config.ingestUrl;
  poseHzEl.textContent = String(config.poseHz);
  foxgloveUrlEl.textContent = `ws://${window.location.hostname}:8765`;

  for (const warning of config.warnings) {
    log(warning, 'warn');
  }
  log(`Relay configurado: ${config.ingestUrl}`, 'info');
  ingest.connect();

  if (!window.isSecureContext) {
    log('Abrí esta página por HTTPS para que WebXR funcione', 'error');
    hintEl.textContent = 'El navegador no considera seguro este origen; WebXR no iniciará.';
  }

  const xr = 'xr' in navigator ? navigator.xr : undefined;
  if (!xr) {
    supported = false;
    log('navigator.xr no existe: este navegador no soporta WebXR', 'error');
  } else {
    try {
      supported = await xr.isSessionSupported('immersive-ar');
      log(`Soporte immersive-ar: ${supported ? 'sí' : 'no'}`, supported ? 'ok' : 'error');
    } catch (error) {
      supported = false;
      log(`isSessionSupported falló: ${errorMessage(error)}`, 'error');
    }
  }

  if (supported === false) {
    hintEl.textContent =
      'Este navegador o dispositivo no soporta immersive-ar. El emulador de Android Studio no implementa WebXR; probá en un celular ARCore por HTTPS.';
  } else if (window.isSecureContext) {
    hintEl.textContent =
      'Todo listo. Al iniciar la sesión, la pose se envía al relay y Foxglove la muestra en /pose/raw.';
  }

  startButton.disabled = !(window.isSecureContext && supported === true);
  updateUi();
}

startButton.addEventListener('click', () => {
  void startSession();
});
overlayStopButton.addEventListener('click', () => {
  void stopSession();
});

void init();
