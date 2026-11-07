/**
 * Carga opcional de `config/camera_intrinsics.json`.
 *
 * El servidor sirve el archivo en `/config/camera_intrinsics.json`. Si no
 * existe, el cliente deriva los intrínsecos de `XRView.projectionMatrix`.
 */
import type { CameraCalibration } from '@vio/shared';
import { safeParseCameraCalibration } from '@vio/shared';

export type CameraCalibrationStatus = 'ok' | 'missing' | 'invalid' | 'error';

export interface CameraCalibrationResult {
  status: CameraCalibrationStatus;
  calibration: CameraCalibration | null;
  message: string;
}

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (url: string) => Promise<FetchResponseLike>;

/** Descarga y valida la calibración. Nunca lanza: devuelve un estado. */
export async function fetchCameraCalibration(
  url: string,
  fetchImpl: FetchLike = (target) => fetch(target),
): Promise<CameraCalibrationResult> {
  let response: FetchResponseLike;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'error',
      calibration: null,
      message: `No se pudo descargar la calibración: ${message}`,
    };
  }

  if (response.status === 404) {
    return {
      status: 'missing',
      calibration: null,
      message: 'No hay archivo de calibración; se derivan los intrínsecos del XRView.',
    };
  }
  if (!response.ok) {
    return {
      status: 'error',
      calibration: null,
      message: `El servidor respondió HTTP ${response.status} al pedir la calibración.`,
    };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'invalid',
      calibration: null,
      message: `La calibración no es JSON válido: ${message}`,
    };
  }

  const parsed = safeParseCameraCalibration(json);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => {
        const field = issue.path.length > 0 ? issue.path.join('.') : '<root>';
        return `${field}: ${issue.message}`;
      })
      .join('; ');
    return {
      status: 'invalid',
      calibration: null,
      message: `La calibración no cumple el esquema: ${details}`,
    };
  }

  return {
    status: 'ok',
    calibration: parsed.data,
    message:
      `Calibración de cámara: ${parsed.data.image_size[0]}×${parsed.data.image_size[1]}, ` +
      `fx=${parsed.data.intrinsics.fx.toFixed(1)}, fy=${parsed.data.intrinsics.fy.toFixed(1)}.`,
  };
}
