/**
 * Dibuja contornos e IDs y proyecta los ejes `world` usando el mapa y la pose detectada.
 */
import type { CameraIntrinsics, MarkerMap, Vec3 } from '@vio/shared';
import { apply, compose, findMarker, inverse, markerPose } from '@vio/shared';
import type { MarkerDetectionResult } from './worker-protocol';

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
  markerMap: MarkerMap | null = null,
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

    const marker = markerMap ? findMarker(markerMap, id) : undefined;
    if (!intrinsics || !marker) continue;

    // Convertir los ejes globales del mapa a la cámara usando la pose observada del tag.
    const T_cv_world = compose(T_cam_marker, inverse(markerPose(marker)));
    const [worldX, worldY, worldZ] = marker.position;
    const originCv = apply(T_cv_world, marker.position);
    const xAxisCv = apply(T_cv_world, [worldX + axisLengthM, worldY, worldZ]);
    const yAxisCv = apply(T_cv_world, [worldX, worldY + axisLengthM, worldZ]);
    const zAxisCv = apply(T_cv_world, [worldX, worldY, worldZ + axisLengthM]);

    const p0 = projectPoint(originCv, intrinsics);
    const px = projectPoint(xAxisCv, intrinsics);
    const py = projectPoint(yAxisCv, intrinsics);
    const pz = projectPoint(zAxisCv, intrinsics);

    if (!p0) continue;
    ctx.lineWidth = 3;

    // Ejes +X, +Y y +Z de `world`: rojo, verde y azul.
    if (px) {
      ctx.strokeStyle = '#ff3333';
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(px[0], px[1]);
      ctx.stroke();
    }

    if (py) {
      ctx.strokeStyle = '#33ff33';
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(py[0], py[1]);
      ctx.stroke();
    }

    if (pz) {
      ctx.strokeStyle = '#3388ff';
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(pz[0], pz[1]);
      ctx.stroke();
    }
  }
}
