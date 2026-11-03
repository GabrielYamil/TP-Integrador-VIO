/**
 * Mapa de marcadores y geometría auxiliar.
 *
 * Marco de marcador adoptado (documentado también en docs/conventions.md):
 *   - Origen en el centro de la cara visible.
 *   - +x hacia la derecha del marcador visto de frente.
 *   - +y hacia arriba.
 *   - +z saliendo de la cara visible (hacia la cámara que lo observa).
 *
 * El orden de las esquinas de `markerObjectPoints` coincide con el que
 * devuelve OpenCV para AprilTag/ArUco: arriba-izquierda, arriba-derecha,
 * abajo-derecha, abajo-izquierda (horario en la imagen).
 */
import { z } from 'zod';
import type { Pose } from '../math/se3';
import { poseFromQuatTranslation } from '../math/se3';
import { quatFromBasis } from '../math/quat';
import type { Vec3 } from '../math/vec3';
import { quatSchema, vec3Schema } from '../messages/schemas';

export const markerDefinitionSchema = z
  .object({
    id: z.number().int().nonnegative(),
    size_m: z.number().positive().finite(),
    position: vec3Schema,
    orientation_xyzw: quatSchema,
  })
  .strict();

export const markerMapSchema = z
  .object({
    frame_id: z.literal('world'),
    dictionary: z.literal('APRILTAG_36h11'),
    markers: z.array(markerDefinitionSchema).min(1),
  })
  .strict()
  .superRefine((map, ctx) => {
    const ids = new Set<number>();
    for (const [index, marker] of map.markers.entries()) {
      if (ids.has(marker.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['markers', index, 'id'],
          message: `ID de marcador duplicado: ${marker.id}`,
        });
      }
      ids.add(marker.id);
    }
  });

export type MarkerDefinition = z.infer<typeof markerDefinitionSchema>;
export type MarkerMap = z.infer<typeof markerMapSchema>;

export function parseMarkerMap(input: unknown): MarkerMap {
  return markerMapSchema.parse(input);
}

export function safeParseMarkerMap(input: unknown) {
  return markerMapSchema.safeParse(input);
}

export function markerPose(marker: MarkerDefinition): Pose {
  return poseFromQuatTranslation(marker.orientation_xyzw, marker.position);
}

export function findMarker(
  map: MarkerMap,
  id: number,
): MarkerDefinition | undefined {
  return map.markers.find((marker) => marker.id === id);
}

export function markerObjectPoints(size_m: number): Vec3[] {
  if (!(size_m > 0)) {
    throw new Error('El tamaño del marcador debe ser positivo');
  }
  const h = size_m / 2;
  return [
    [-h, h, 0],
    [h, h, 0],
    [h, -h, 0],
    [-h, -h, 0],
  ];
}

export interface RoomDimensions {
  /** Extensión en x (m). */
  width_m: number;
  /** Extensión en y (m). */
  depth_m: number;
  /** Altura en z (m). */
  height_m: number;
}

export type WallSide = 'north' | 'south' | 'east' | 'west';

export interface WallMarkerPlacement {
  wall: WallSide;
  size_m: number;
  /** Distancia desde la esquina izquierda de la pared, vista desde adentro, al centro. */
  offsetFromLeft_m: number;
  /** Altura del centro del marcador sobre el piso. */
  height_m: number;
  /** Separación hacia el interior de la sala. 0 = plano de la pared. */
  standoff_m?: number;
}

/**
 * Calcula la pose de un marcador pegado en una pared de una sala rectangular.
 *
 * El origen de `world` está en la esquina (x=0, y=0, z=0), con +x a lo largo
 * de las paredes norte/sur, +y a lo largo de las paredes este/oeste y +z arriba.
 * Las paredes miran hacia adentro de la sala.
 *
 * "Izquierda" se define mirando la pared desde el interior:
 *   - south (y=0): izquierda = x=width
 *   - north (y=depth): izquierda = x=0
 *   - east (x=width): izquierda = y=depth
 *   - west (x=0): izquierda = y=0
 */
export function markerPoseOnWall(
  room: RoomDimensions,
  placement: WallMarkerPlacement,
): Pose {
  validateRoom(room);
  const { wall, size_m, offsetFromLeft_m, height_m, standoff_m = 0 } = placement;
  if (!(size_m > 0)) {
    throw new Error('El tamaño del marcador debe ser positivo');
  }
  if (!(standoff_m >= 0)) {
    throw new Error('El standoff debe ser mayor o igual a cero');
  }

  const span = wall === 'north' || wall === 'south' ? room.width_m : room.depth_m;
  const half = size_m / 2;
  if (offsetFromLeft_m < half || offsetFromLeft_m > span - half) {
    throw new Error(
      `El marcador no entra en la pared ${wall}: offset ${offsetFromLeft_m} m, ` +
        `pared ${span} m, tamaño ${size_m} m`,
    );
  }
  if (height_m < half || height_m > room.height_m - half) {
    throw new Error(
      `El marcador no entra en altura: height ${height_m} m, sala ${room.height_m} m`,
    );
  }

  let origin: Vec3;
  let xAxis: Vec3;
  let zAxis: Vec3;

  switch (wall) {
    case 'north':
      origin = [0, room.depth_m, 0];
      xAxis = [1, 0, 0];
      zAxis = [0, -1, 0];
      break;
    case 'south':
      origin = [room.width_m, 0, 0];
      xAxis = [-1, 0, 0];
      zAxis = [0, 1, 0];
      break;
    case 'east':
      origin = [room.width_m, room.depth_m, 0];
      xAxis = [0, -1, 0];
      zAxis = [-1, 0, 0];
      break;
    case 'west':
      origin = [0, 0, 0];
      xAxis = [0, 1, 0];
      zAxis = [1, 0, 0];
      break;
  }

  const yAxis: Vec3 = [0, 0, 1];
  const position: Vec3 = [
    origin[0] + xAxis[0] * offsetFromLeft_m + zAxis[0] * standoff_m,
    origin[1] + xAxis[1] * offsetFromLeft_m + zAxis[1] * standoff_m,
    origin[2] + xAxis[2] * offsetFromLeft_m + height_m + zAxis[2] * standoff_m,
  ];

  return poseFromQuatTranslation(quatFromBasis(xAxis, yAxis, zAxis), position);
}

function validateRoom(room: RoomDimensions): void {
  for (const [name, value] of Object.entries(room)) {
    if (!(value > 0) || !Number.isFinite(value)) {
      throw new Error(`Dimensión de sala inválida: ${name}=${value}`);
    }
  }
}
