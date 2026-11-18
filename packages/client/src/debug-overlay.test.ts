import { describe, expect, it } from 'vitest';
import type { CameraIntrinsics } from '@vio/shared';
import { drawDebugOverlay } from './debug-overlay';
import type { MarkerDetectionResult } from './worker-protocol';

describe('drawDebugOverlay', () => {
  it('dibuja la superposición 2D y ejes 3D sin errores en el canvas', () => {
    const commands: string[] = [];
    const mockContext = {
      canvas: { width: 640, height: 480 },
      lineWidth: 1,
      strokeStyle: '',
      fillStyle: '',
      font: '',
      beginPath() {
        commands.push('beginPath');
      },
      moveTo(x: number, y: number) {
        commands.push(`moveTo:${x},${y}`);
      },
      lineTo(x: number, y: number) {
        commands.push(`lineTo:${x},${y}`);
      },
      closePath() {
        commands.push('closePath');
      },
      stroke() {
        commands.push('stroke');
      },
      arc(x: number, y: number) {
        commands.push(`arc:${x},${y}`);
      },
      fill() {
        commands.push('fill');
      },
      fillText(text: string, x: number, y: number) {
        commands.push(`fillText:${text}:${x},${y}`);
      },
    } as unknown as CanvasRenderingContext2D;

    const detections: MarkerDetectionResult[] = [
      {
        id: 1,
        reproj_err_px: 0.5,
        corners: [
          [100, 100],
          [200, 100],
          [200, 200],
          [100, 200],
        ],
        T_cam_marker: {
          p: [0, 0, 1], // 1m frente a la cámara
          q: [0, 0, 0, 1],
        },
      },
    ];

    const intrinsics: CameraIntrinsics = {
      fx: 500,
      fy: 500,
      cx: 320,
      cy: 240,
    };

    drawDebugOverlay(mockContext, detections, intrinsics);

    expect(commands).toContain('closePath');
    expect(commands).toContain('stroke');
    expect(commands).toContain('fillText:ID:1 (0.5px):106,94');
  });

  it('ignora canvases vacíos sin lanzar errores', () => {
    const mockContext = {
      canvas: { width: 0, height: 0 },
    } as CanvasRenderingContext2D;

    expect(() => drawDebugOverlay(mockContext, [], null)).not.toThrow();
  });
});
