import { describe, expect, it } from 'vitest';
import type { CameraIntrinsics, MarkerMap } from '@vio/shared';
import { drawDebugOverlay } from './debug-overlay';
import type { MarkerDetectionResult } from './worker-protocol';

describe('drawDebugOverlay', () => {
  it('projects world axes using the observed marker and its map orientation', () => {
    const commands: string[] = [];
    const axisLines: Array<{ color: string; x: number; y: number }> = [];
    let strokeStyle = '';
    const mockContext = {
      canvas: { width: 640, height: 480 },
      lineWidth: 1,
      get strokeStyle() {
        return strokeStyle;
      },
      set strokeStyle(value: string) {
        strokeStyle = value;
      },
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
        axisLines.push({ color: strokeStyle, x, y });
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
          p: [0.2, 0.1, 1],
          q: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
        },
      },
    ];

    const intrinsics: CameraIntrinsics = {
      fx: 500,
      fy: 500,
      cx: 320,
      cy: 240,
    };

    const markerMap: MarkerMap = {
      frame_id: 'world',
      dictionary: 'APRILTAG_36h11',
      markers: [
        {
          id: 1,
          size_m: 0.15,
          position: [0, 0, 0],
          orientation_xyzw: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
        },
      ],
    };

    drawDebugOverlay(mockContext, detections, intrinsics, markerMap);

    expect(commands).toContain('closePath');
    expect(commands).toContain('fillText:ID:1 (0.5px):106,94');

    const xAxis = axisLines.find(({ color }) => color === '#ff3333');
    expect(xAxis?.x).toBeCloseTo(460);
    expect(xAxis?.y).toBeCloseTo(290);

    const yAxis = axisLines.find(({ color }) => color === '#33ff33');
    expect(yAxis?.x).toBeCloseTo(420);
    expect(yAxis?.y).toBeCloseTo(330);
  });

  it('ignora canvases vacíos sin lanzar errores', () => {
    const mockContext = {
      canvas: { width: 0, height: 0 },
    } as CanvasRenderingContext2D;

    expect(() => drawDebugOverlay(mockContext, [], null)).not.toThrow();
  });
});
