/**
 * Calibración opcional de cámara cargada desde `config/camera_intrinsics.json`.
 *
 * El archivo es local y no se versiona. El ejemplo versionado es
 * `config/camera_intrinsics.example.json`. Los intrínsecos se definen para la
 * resolución `image_size` y el cliente los escala a la resolución procesada.
 */
import { z } from 'zod';
import type { CameraIntrinsics } from '../messages/schemas';
import { cameraIntrinsicsSchema, imageSizeSchema } from '../messages/schemas';
import type { ImageSize } from './intrinsics';
import { scaleIntrinsicsToSize } from './intrinsics';

export const cameraCalibrationSchema = z
  .object({
    image_size: imageSizeSchema,
    intrinsics: cameraIntrinsicsSchema,
    reprojection_error_px: z.number().finite().nonnegative().optional(),
    note: z.string().min(1).max(512).optional(),
  })
  .strict();

export type CameraCalibration = z.infer<typeof cameraCalibrationSchema>;

export function parseCameraCalibration(input: unknown): CameraCalibration {
  return cameraCalibrationSchema.parse(input);
}

export function safeParseCameraCalibration(input: unknown) {
  return cameraCalibrationSchema.safeParse(input);
}

/**
 * Escala la calibración a la resolución de la imagen procesada.
 *
 * OpenCV usa origen arriba a la izquierda, igual que el archivo de calibración
 * y que la imagen en gris que produce el cliente. No hay que reflejar `cy`.
 */
export function calibrationIntrinsicsForSize(
  calibration: CameraCalibration,
  width: number,
  height: number,
): CameraIntrinsics {
  const from: ImageSize = calibration.image_size;
  return scaleIntrinsicsToSize(calibration.intrinsics, from, [width, height]);
}
