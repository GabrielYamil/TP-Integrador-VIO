/**
 * Esquemas de validación de los mensajes JSON cliente -> servidor.
 * Ver sección 4 del plan y docs/conventions.md.
 */
import { z } from 'zod';

export const vec3Schema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

/**
 * Cuaternión [x, y, z, w] unitario. Se tolera un error de norma de 1e-3 para
 * aceptar valores que pasaron por Float32 o por una serialización decimal.
 */
export const quatSchema = z
  .tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()])
  .refine((q) => Math.abs(Math.hypot(q[0], q[1], q[2], q[3]) - 1) <= 1e-3, {
    message: 'El cuaternión debe ser unitario (tolerancia 1e-3)',
  });

export const poseSchema = z
  .object({
    p: vec3Schema,
    q: quatSchema,
  })
  .strict();

export const imageSizeSchema = z.tuple([z.number().int().positive(), z.number().int().positive()]);

export const trackingStateSchema = z.enum(['tracking', 'limited', 'lost']);

export const poseMessageSchema = z
  .object({
    type: z.literal('pose'),
    t: z.number().finite().nonnegative(),
    raw: poseSchema,
    corrected: poseSchema.optional(),
    tracking: trackingStateSchema,
  })
  .strict();

export const markerMessageSchema = z
  .object({
    type: z.literal('marker'),
    t: z.number().finite().nonnegative(),
    id: z.number().int().nonnegative(),
    T_cam_marker: poseSchema,
    reproj_err_px: z.number().finite().nonnegative(),
  })
  .strict();

export const correctionMessageSchema = z
  .object({
    type: z.literal('correction'),
    t: z.number().finite().nonnegative(),
    id: z.number().int().nonnegative(),
    delta_p_m: z.number().finite().nonnegative(),
    delta_angle_rad: z.number().finite().nonnegative(),
  })
  .strict();

export const cameraIntrinsicsSchema = z
  .object({
    fx: z.number().finite().positive(),
    fy: z.number().finite().positive(),
    cx: z.number().finite().nonnegative(),
    cy: z.number().finite().nonnegative(),
  })
  .strict();

export const helloMessageSchema = z
  .object({
    type: z.literal('hello'),
    device: z.string().min(1).max(256),
    intrinsics: cameraIntrinsicsSchema,
    image_size: imageSizeSchema,
  })
  .strict();

export const clientMessageSchema = z.discriminatedUnion('type', [
  poseMessageSchema,
  markerMessageSchema,
  correctionMessageSchema,
  helloMessageSchema,
]);

export type Vec3Message = z.infer<typeof vec3Schema>;
export type QuatMessage = z.infer<typeof quatSchema>;
export type PoseMessage = z.infer<typeof poseSchema>;
export type TrackingState = z.infer<typeof trackingStateSchema>;
export type PoseMessagePayload = z.infer<typeof poseMessageSchema>;
export type MarkerMessage = z.infer<typeof markerMessageSchema>;
export type CorrectionMessage = z.infer<typeof correctionMessageSchema>;
export type CameraIntrinsics = z.infer<typeof cameraIntrinsicsSchema>;
export type HelloMessage = z.infer<typeof helloMessageSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ParseClientMessageResult =
  { ok: true; message: ClientMessage } | { ok: false; error: string };

export function parseClientMessage(input: unknown): ParseClientMessageResult {
  const result = clientMessageSchema.safeParse(input);
  if (result.success) {
    return { ok: true, message: result.data };
  }
  const details = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
  return { ok: false, error: details };
}

export function parseClientMessageJson(text: string): ParseClientMessageResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `JSON inválido: ${message}` };
  }
  return parseClientMessage(value);
}
