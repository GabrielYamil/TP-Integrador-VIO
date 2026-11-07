/**
 * Carga opcional de `config/camera_intrinsics.json`.
 *
 * A diferencia del mapa de marcadores, la calibración es opcional: si falta, el
 * cliente deriva los intrínsecos del XRView. Un archivo presente pero inválido
 * se reporta como error para no ocultar una calibración mal escrita.
 */
import { existsSync, readFileSync } from 'node:fs';
import type { CameraCalibration } from '@vio/shared';
import { safeParseCameraCalibration } from '@vio/shared';

export interface CameraCalibrationLoadResult {
  calibration: CameraCalibration | null;
  error: string | null;
}

export function loadOptionalCameraCalibration(path: string): CameraCalibrationLoadResult {
  if (!existsSync(path)) {
    return { calibration: null, error: null };
  }

  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { calibration: null, error: `No se pudo leer "${path}": ${message}` };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { calibration: null, error: `"${path}" no es JSON válido: ${message}` };
  }

  const parsed = safeParseCameraCalibration(json);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => {
        const field = issue.path.length > 0 ? issue.path.join('.') : '<root>';
        return `${field}: ${issue.message}`;
      })
      .join('; ');
    return { calibration: null, error: `Calibración inválida (${path}): ${details}` };
  }

  return { calibration: parsed.data, error: null };
}
