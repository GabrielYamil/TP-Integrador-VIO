/**
 * Corrector de localización en tiempo real (Fase 6).
 *
 * Mantiene la estimación `T_world_odom` y aplica las correcciones basadas en los
 * marcadores observados según la estrategia seleccionada:
 *   - 'direct' (A): reemplazo instantáneo de `T_world_odom`.
 *   - 'smooth' (B): transición gradual por LERP/SLERP hacia la pose objetivo.
 *   - 'off': sin corrección de mapa, se usa la pose inicial `worldFromOdomInitial()`.
 */
import type { CorrectionDelta, CorrectionMessage, MarkerMap, Pose } from '@vio/shared';
import {
  correctedCameraPose,
  correctionDelta,
  estimateWorldOdomFromObservation,
  findMarker,
  interpolate,
  markerPose,
  worldFromOdomInitial,
} from '@vio/shared';
import type { CorrectionMode } from './client-config';

export interface LocalizationCorrectorOptions {
  mode?: CorrectionMode;
  markerMap?: MarkerMap | null;
  /** Factor de suavizado para el modo 'smooth' [0..1]. Por defecto 0.20. */
  smoothAlpha?: number;
  /** Máximo error de reproyección aceptado en px. Por defecto 5.0. */
  maxReprojErrPx?: number;
  /** Máximo salto de posición aceptado al estar inicializado (m). Por defecto 1.5. */
  maxJumpPositionM?: number;
  /** Máximo salto angular aceptado al estar inicializado (rad). Por defecto 0.8 rad (~45°). */
  maxJumpAngleRad?: number;
}

export interface ProcessObservationInput {
  markerId: number;
  t: number;
  T_odom_cam: Pose;
  T_cam_marker: Pose;
  reprojErrPx: number;
}

export interface ProcessObservationResult {
  accepted: boolean;
  delta?: CorrectionDelta;
  message?: CorrectionMessage;
  reason?: string;
}

export interface CorrectorStats {
  mode: CorrectionMode;
  initialized: boolean;
  acceptedCount: number;
  rejectedCount: number;
  lastDelta: CorrectionDelta | null;
}

export class LocalizationCorrector {
  #mode: CorrectionMode;
  #map: MarkerMap | null;
  #smoothAlpha: number;
  #maxReprojErrPx: number;
  #maxJumpPositionM: number;
  #maxJumpAngleRad: number;

  #T_world_odom: Pose;
  #target_T_world_odom: Pose | null = null;
  #initialized = false;
  #acceptedCount = 0;
  #rejectedCount = 0;
  #lastDelta: CorrectionDelta | null = null;

  constructor(options: LocalizationCorrectorOptions = {}) {
    this.#mode = options.mode ?? 'smooth';
    this.#map = options.markerMap ?? null;
    this.#smoothAlpha = options.smoothAlpha ?? 0.2;
    this.#maxReprojErrPx = options.maxReprojErrPx ?? 5.0;
    this.#maxJumpPositionM = options.maxJumpPositionM ?? 1.5;
    this.#maxJumpAngleRad = options.maxJumpAngleRad ?? 0.8;
    this.#T_world_odom = worldFromOdomInitial();
  }

  public getMode(): CorrectionMode {
    return this.#mode;
  }

  public setMode(mode: CorrectionMode): void {
    this.#mode = mode;
  }

  public setMarkerMap(map: MarkerMap | null): void {
    this.#map = map;
  }

  public isInitialized(): boolean {
    return this.#initialized;
  }

  public getWorldOdom(): Pose {
    return this.#T_world_odom;
  }

  public getCorrectedCameraPose(T_odom_cam: Pose): Pose {
    return correctedCameraPose(this.#T_world_odom, T_odom_cam);
  }

  public getStats(): CorrectorStats {
    return {
      mode: this.#mode,
      initialized: this.#initialized,
      acceptedCount: this.#acceptedCount,
      rejectedCount: this.#rejectedCount,
      lastDelta: this.#lastDelta,
    };
  }

  public reset(): void {
    this.#T_world_odom = worldFromOdomInitial();
    this.#target_T_world_odom = null;
    this.#initialized = false;
    this.#acceptedCount = 0;
    this.#rejectedCount = 0;
    this.#lastDelta = null;
  }

  public processObservation(input: ProcessObservationInput): ProcessObservationResult {
    if (this.#mode === 'off') {
      return { accepted: false, reason: 'mode_off' };
    }
    if (!this.#map) {
      return { accepted: false, reason: 'no_marker_map' };
    }
    if (input.reprojErrPx > this.#maxReprojErrPx) {
      this.#rejectedCount += 1;
      return { accepted: false, reason: 'reproj_error_too_high' };
    }

    const marker = findMarker(this.#map, input.markerId);
    if (!marker) {
      this.#rejectedCount += 1;
      return { accepted: false, reason: 'marker_not_in_map' };
    }

    const T_world_marker = markerPose(marker);
    const estimated_T_world_odom = estimateWorldOdomFromObservation({
      markerId: input.markerId,
      T_odom_cam: input.T_odom_cam,
      T_cam_marker: input.T_cam_marker,
      T_world_marker,
    });

    if (this.#initialized) {
      const jump = correctionDelta(this.#T_world_odom, estimated_T_world_odom);
      if (jump.delta_p_m > this.#maxJumpPositionM || jump.delta_angle_rad > this.#maxJumpAngleRad) {
        this.#rejectedCount += 1;
        return { accepted: false, reason: 'outlier_jump_exceeded' };
      }
    }

    const previousWorldOdom = this.#T_world_odom;

    if (!this.#initialized) {
      this.#T_world_odom = estimated_T_world_odom;
      this.#target_T_world_odom = estimated_T_world_odom;
      this.#initialized = true;
    } else if (this.#mode === 'direct') {
      this.#T_world_odom = estimated_T_world_odom;
      this.#target_T_world_odom = estimated_T_world_odom;
    } else if (this.#mode === 'smooth') {
      this.#target_T_world_odom = estimated_T_world_odom;
      this.#T_world_odom = interpolate(
        this.#T_world_odom,
        estimated_T_world_odom,
        this.#smoothAlpha,
      );
    }

    const delta = correctionDelta(previousWorldOdom, this.#T_world_odom);
    this.#lastDelta = delta;
    this.#acceptedCount += 1;

    const message: CorrectionMessage = {
      type: 'correction',
      t: input.t,
      id: input.markerId,
      delta_p_m: delta.delta_p_m,
      delta_angle_rad: delta.delta_angle_rad,
    };

    return {
      accepted: true,
      delta,
      message,
    };
  }

  /**
   * Avanza la interpolación gradual del modo 'smooth' en cada frame.
   */
  public tick(): void {
    if (this.#mode === 'smooth' && this.#initialized && this.#target_T_world_odom !== null) {
      this.#T_world_odom = interpolate(
        this.#T_world_odom,
        this.#target_T_world_odom,
        this.#smoothAlpha * 0.5,
      );
    }
  }
}
