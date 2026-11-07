/**
 * Configuración del cliente de la Fase 3.
 *
 * Los valores por defecto están centralizados acá. La frecuencia de pose y la
 * URL del relay se pueden sobrescribir por query string para las pruebas:
 *
 *   /ar.html?hz=15&ingest=wss://192.168.1.18:8443/ingest
 *
 * Los límites del buffer y de reconexión viven en `ws-client.ts` porque son
 * parte del transporte, no de la sesión WebXR.
 */
export interface ClientConfig {
  poseHz: number;
  uiIntervalMs: number;
  statsWindowMs: number;
  trackingLostFrames: number;
  /** Evita que la UI quede en "consultando" si el navegador no responde. */
  supportTimeoutMs: number;
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
  ingestUrl: string;
  warnings: string[];
}

/**
 * Lee los overrides de la URL. Un valor inválido no rompe la página: se ignora
 * y se devuelve un warning para mostrarlo en el log.
 */
export function readRuntimeConfig(search: string = window.location.search): RuntimeConfig {
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

  let ingestUrl = defaultIngestUrl();
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

  return {
    poseHz,
    uiIntervalMs: CLIENT_CONFIG.uiIntervalMs,
    statsWindowMs: CLIENT_CONFIG.statsWindowMs,
    trackingLostFrames: CLIENT_CONFIG.trackingLostFrames,
    supportTimeoutMs: CLIENT_CONFIG.supportTimeoutMs,
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
