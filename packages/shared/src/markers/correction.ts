/**
 * Corrección de localización con marcadores fiduciarios.
 *
 * Fórmulas (sección 4 del plan):
 *   T_odom_marker = T_odom_cam * C_WEBXR_CV * T_cam_marker
 *   T_world_odom  = T_world_marker * inverse(T_odom_marker)
 *   T_world_cam   = T_world_odom * T_odom_cam
 *
 * `T_cam_marker` es la salida de PnP en el marco OpenCV de la cámara.
 */
import { C_WEBXR_CV } from '../conventions/axes';
import type { Pose } from '../math/se3';
import {
  compose,
  inverse,
  poseAngle,
  relativePose,
} from '../math/se3';
import { vDistance } from '../math/vec3';

export interface CorrectionEstimate {
  markerId: number;
  /** Pose del marcador en odom, reconstruida desde la observación. */
  T_odom_marker: Pose;
  /** Corrección estimada entre world y odom. */
  T_world_odom: Pose;
  /** Pose de la cámara en world usando la corrección recién estimada. */
  T_world_cam: Pose;
}

export interface ObservationCorrectionInput {
  markerId: number;
  T_odom_cam: Pose;
  T_cam_marker: Pose;
  T_world_marker: Pose;
}

export function estimateOdomMarker(
  T_odom_cam: Pose,
  T_cam_marker: Pose,
): Pose {
  return compose(compose(T_odom_cam, C_WEBXR_CV), T_cam_marker);
}

export function estimateWorldOdom(
  T_world_marker: Pose,
  T_odom_marker: Pose,
): Pose {
  return compose(T_world_marker, inverse(T_odom_marker));
}

export function estimateWorldOdomFromObservation(
  input: ObservationCorrectionInput,
): Pose {
  const { T_odom_cam, T_cam_marker, T_world_marker } = input;
  const T_odom_marker = estimateOdomMarker(T_odom_cam, T_cam_marker);
  return estimateWorldOdom(T_world_marker, T_odom_marker);
}

export function correctedCameraPose(
  T_world_odom: Pose,
  T_odom_cam: Pose,
): Pose {
  return compose(T_world_odom, T_odom_cam);
}

export function estimateCorrection(
  input: ObservationCorrectionInput,
): CorrectionEstimate {
  const T_odom_marker = estimateOdomMarker(input.T_odom_cam, input.T_cam_marker);
  const T_world_odom = estimateWorldOdom(input.T_world_marker, T_odom_marker);
  const T_world_cam = correctedCameraPose(T_world_odom, input.T_odom_cam);
  return {
    markerId: input.markerId,
    T_odom_marker,
    T_world_odom,
    T_world_cam,
  };
}

export interface CorrectionDelta {
  delta_p_m: number;
  delta_angle_rad: number;
}

/** Magnitud del cambio entre dos estimaciones de `T_world_odom`. */
export function correctionDelta(before: Pose, after: Pose): CorrectionDelta {
  return {
    delta_p_m: vDistance(before.p, after.p),
    delta_angle_rad: poseAngle(relativePose(before, after)),
  };
}
