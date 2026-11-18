/**
 * Renderizado de superposición de depuración (contornos 2D, IDs y ejes 3D proyectados).
 */
import type { CameraIntrinsics, Quat, Vec3 } from '@vio/shared';
import { quatToMat3 } from '@vio/shared';
import type { MarkerDetectionResult } from './worker-protocol';

/**
 * Transforma un punto 3D desde el marco del marcador al marco de la cámara OpenCV usando T_cam_marker = (p, q).
 */
function transformMarkerToCam(pointMarker: Vec3, p: Vec3, q: Quat): Vec3 {
  const R = quatToMat3(q); // Column-major Mat3
  // p_cam = R * pointMarker + p
  const [x, y, z] = pointMarker;
  const cx = R[0] * x + R[3] * y + R[6] * z + p[0];
  const cy = R[1] * x + R[4] * y + R[7] * z + p[1];
  const cz = R[2] * x + R[5] * y + R[8] * z + p[2];
  return [cx, cy, cz];
}

/**
 * Proyecta un punto 3D en el marco OpenCV (x derecha, y abajo, z adelante) a coordenadas 2D de píxel.
 */
function projectPoint(pointCam: Vec3, intrinsics: CameraIntrinsics): [number, number] | null {
  const [x, y, z] = pointCam;
  if (z <= 1e-4) {
    return null; // Detrás de la cámara
  }
  const u = intrinsics.fx * (x / z) + intrinsics.cx;
  const v = intrinsics.fy * (y / z) + intrinsics.cy;
  return [u, v];
}

export function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  detections: MarkerDetectionResult[],
  intrinsics: CameraIntrinsics | null,
  axisLengthM = 0.08,
): void {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  if (width === 0 || height === 0) return;

  for (const det of detections) {
    const { id, corners, reproj_err_px, T_cam_marker } = det;
    if (corners.length < 4) continue;

    // 1. Dibujar polígono del marcador (esquinas 0->1->2->3->0)
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#00ffcc';
    ctx.beginPath();
    ctx.moveTo(corners[0][0], corners[0][1]);
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(corners[i][0], corners[i][1]);
    }
    ctx.closePath();
    ctx.stroke();

    // Marcar esquina top-left (origen de orientación) con un círculo rojo
    ctx.fillStyle = '#ff0055';
    ctx.beginPath();
    ctx.arc(corners[0][0], corners[0][1], 4, 0, Math.PI * 2);
    ctx.fill();

    // Etiqueta de ID y error
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#ffff00';
    ctx.fillText(`ID:${id} (${reproj_err_px.toFixed(1)}px)`, corners[0][0] + 6, corners[0][1] - 6);

    // 2. Dibujar ejes 3D (X=rojo, Y=verde, Z=azul)
    if (intrinsics) {
      const p = T_cam_marker.p;
      const q = T_cam_marker.q;

      const originCam = transformMarkerToCam([0, 0, 0], p, q);
      const xAxisCam = transformMarkerToCam([axisLengthM, 0, 0], p, q);
      const yAxisCam = transformMarkerToCam([0, axisLengthM, 0], p, q);
      const zAxisCam = transformMarkerToCam([0, 0, axisLengthM], p, q);

      const p0 = projectPoint(originCam, intrinsics);
      const px = projectPoint(xAxisCam, intrinsics);
      const py = projectPoint(yAxisCam, intrinsics);
      const pz = projectPoint(zAxisCam, intrinsics);

      if (p0) {
        ctx.lineWidth = 3;

        // Eje X (+x derecha en el marcador) - Rojo
        if (px) {
          ctx.strokeStyle = '#ff3333';
          ctx.beginPath();
          ctx.moveTo(p0[0], p0[1]);
          ctx.lineTo(px[0], px[1]);
          ctx.stroke();
        }

        // Eje Y (+y arriba en el marcador) - Verde
        if (py) {
          ctx.strokeStyle = '#33ff33';
          ctx.beginPath();
          ctx.moveTo(p0[0], p0[1]);
          ctx.lineTo(py[0], py[1]);
          ctx.stroke();
        }

        // Eje Z (+z saliendo de la cara del marcador) - Azul
        if (pz) {
          ctx.strokeStyle = '#3388ff';
          ctx.beginPath();
          ctx.moveTo(p0[0], p0[1]);
          ctx.lineTo(pz[0], pz[1]);
          ctx.stroke();
        }
      }
    }
  }
}
