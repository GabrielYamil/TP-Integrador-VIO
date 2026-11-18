/**
 * Protocolo de mensajes entre el hilo principal (ar.ts) y el Web Worker de detección (marker-worker.ts).
 */
import type { CameraIntrinsics, Quat, Vec3 } from '@vio/shared';

export interface MarkerDetectionResult {
  id: number;
  T_cam_marker: {
    p: Vec3;
    q: Quat;
  };
  reproj_err_px: number;
  corners: [number, number][]; // 4 esquinas [[x0,y0], [x1,y1], [x2,y2], [x3,y3]] en px
}

export interface WorkerInitRequest {
  type: 'init';
  defaultMarkerSize?: number;
  markerSizes?: Record<number, number>; // id -> size_m
}

export interface WorkerDetectRequest {
  type: 'detect';
  t: number;
  width: number;
  height: number;
  intrinsics: CameraIntrinsics;
  buffer: ArrayBuffer;
}

export type WorkerRequest = WorkerInitRequest | WorkerDetectRequest;

export interface WorkerReadyResponse {
  type: 'ready';
}

export interface WorkerDetectResponse {
  type: 'detect_result';
  t: number;
  detections: MarkerDetectionResult[];
  buffer: ArrayBuffer;
}

export interface WorkerErrorResponse {
  type: 'error';
  error: string;
  buffer?: ArrayBuffer;
}

export type WorkerResponse = WorkerReadyResponse | WorkerDetectResponse | WorkerErrorResponse;
