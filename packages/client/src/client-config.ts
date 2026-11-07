/**
 * Configuración del cliente de las fases 3 y 4.
 *
 * Los valores por defecto están centralizados acá. La frecuencia de pose, la
 * URL del relay y los parámetros de captura se pueden sobrescribir por query
 * string para las pruebas:
 *
 *   /ar.html?hz=15&ingest=wss://192.168.1.18:8443/ingest
 *   /ar.html?camhz=5&camw=480&preview=0
 *
 * Los límites del buffer y de reconexión viven en `ws-client.ts` porque son
 * parte del transporte, no de la sesión WebXR.
 */
export interface CameraConfig {
  /** Lado máximo de la imagen procesada; se conserva la relación de aspecto. */
  maxDimension: number;
  /** Frecuencia máxima de captura y conversión a gris. */
  captureHz: number;
  /** Muestra la imagen en gris en el overlay. */
  preview: boolean;
  /** Ruta servida por Express o por el proxy de Vite. */
  calibrationUrl: string;
}

export interface ClientConfig {
  poseHz: number;
  uiIntervalMs: number;
  statsWindowMs: number;
  trackingLostFrames: number;
  /** Evita que la UI quede en "consultando" si el navegador no responde. */
  supportTimeoutMs: number;
  camera: CameraConfig;
  ingest: {
    maxBufferedMessages: number;
    maxBufferAgeMs: number;
    reconnectBaseMs: number;
    reconnectMaxMs: number;
    reconnectJitter: number;
  };
}

export const CLIENT_CONFIG: ClientConfig = {
  poseHz: 30,
  uiIntervalMs: 250,
  statsWindowMs: 500,
  trackingLostFrames: 30,
  supportTimeoutMs: 5000,
  camera: {
    maxDimension: 640,
    captureHz: 10,
    preview: true,
    calibrationUrl: '/config/camera_intrinsics.json',
  },
  ingest: {
    maxBufferedMessages: 120,
    maxBufferAgeMs: 3000,
    reconnectBaseMs: 500,
    reconnectMaxMs: 10000,
    reconnectJitter: 0.2,
  },
};

export interface RuntimeConfig {
  poseHz: number;
  uiIntervalMs: number;
  statsWindowMs: number;
  trackingLostFrames: number;
  supportTimeoutMs: number;
  camera: CameraConfig;
  ingestUrl: string;
  warnings: string[];
}

/**
 * Lee los overrides de la URL. Un valor inválido no rompe la página: se ignora
 * y se devuelve un warning para mostrarlo en el log.
 */
export function readRuntimeConfig(
  search: string = window.location.search,
  location: Pick<Location, 'protocol' | 'host'> = window.location,
): RuntimeConfig {
  const params = new URLSearchParams(search);
  const warnings: string[] = [];

  let poseHz = CLIENT_CONFIG.poseHz;
  const rawHz = params.get('hz');
  if (rawHz !== null) {
    const parsed = Number(rawHz);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 60) {
      poseHz = parsed;
    } else {
      warnings.push(`El parámetro hz="${rawHz}" no es válido; se usa ${poseHz} Hz.`);
    }
  }

  let ingestUrl = defaultIngestUrl(location);
  const override = params.get('ingest');
  if (override !== null) {
    const sanitized = sanitizeIngestUrl(override);
    if (sanitized) {
      ingestUrl = sanitized;
    } else {
      warnings.push(
        `El parámetro ingest="${override}" no es una URL ws:// o wss:// válida; se usa ${ingestUrl}.`,
      );
    }
  }

  const camera: CameraConfig = { ...CLIENT_CONFIG.camera };

  const rawCameraHz = params.get('camhz');
  if (rawCameraHz !== null) {
    const parsed = Number(rawCameraHz);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 30) {
      camera.captureHz = parsed;
    } else {
      warnings.push(
        `El parámetro camhz="${rawCameraHz}" no es válido; se usa ${camera.captureHz} Hz.`,
      );
    }
  }

  const rawCameraWidth = params.get('camw');
  if (rawCameraWidth !== null) {
    const parsed = Number(rawCameraWidth);
    if (Number.isInteger(parsed) && parsed >= 80 && parsed <= 1920) {
      camera.maxDimension = parsed;
    } else {
      warnings.push(
        `El parámetro camw="${rawCameraWidth}" no es válido; se usa ${camera.maxDimension} px.`,
      );
    }
  }

  const rawPreview = params.get('preview');
  if (rawPreview !== null) {
    if (rawPreview === '1' || rawPreview === 'true') {
      camera.preview = true;
    } else if (rawPreview === '0' || rawPreview === 'false') {
      camera.preview = false;
    } else {
      warnings.push(
        `El parámetro preview="${rawPreview}" no es válido; se usa ${camera.preview ? '1' : '0'}.`,
      );
    }
  }

  return {
    poseHz,
    uiIntervalMs: CLIENT_CONFIG.uiIntervalMs,
    statsWindowMs: CLIENT_CONFIG.statsWindowMs,
    trackingLostFrames: CLIENT_CONFIG.trackingLostFrames,
    supportTimeoutMs: CLIENT_CONFIG.supportTimeoutMs,
    camera,
    ingestUrl,
    warnings,
  };
}

export function defaultIngestUrl(
  location: Pick<Location, 'protocol' | 'host'> = window.location,
): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ingest`;
}

function sanitizeIngestUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol === 'ws:' || url.protocol === 'wss:') {
      return url.toString();
    }
  } catch {
    // Se descarta abajo.
  }
  return null;
}
