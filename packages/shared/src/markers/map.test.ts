import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mat4AlmostEqual } from '../math/mat4';
import { applyDirection, poseToMat4 } from '../math/se3';
import type { Vec3 } from '../math/vec3';
import { vAlmostEqual, vDistance } from '../math/vec3';
import type { RoomDimensions, WallMarkerPlacement } from './map';
import {
  findMarker,
  markerObjectPoints,
  markerPose,
  markerPoseOnWall,
  parseMarkerMap,
  safeParseMarkerMap,
} from './map';

const ROOM: RoomDimensions = { width_m: 4, depth_m: 3, height_m: 2.5 };
const SIZE = 0.16;

const PLACEMENTS: Array<WallMarkerPlacement & { id: number }> = [
  { id: 0, wall: 'south', size_m: SIZE, offsetFromLeft_m: 1.0, height_m: 1.2 },
  { id: 1, wall: 'south', size_m: SIZE, offsetFromLeft_m: 2.5, height_m: 1.2 },
  { id: 2, wall: 'north', size_m: SIZE, offsetFromLeft_m: 1.0, height_m: 1.2 },
  { id: 3, wall: 'north', size_m: SIZE, offsetFromLeft_m: 3.0, height_m: 1.2 },
  { id: 4, wall: 'west', size_m: SIZE, offsetFromLeft_m: 1.5, height_m: 1.2 },
  { id: 5, wall: 'east', size_m: SIZE, offsetFromLeft_m: 1.5, height_m: 1.2 },
];

function expectDirection(actual: Vec3, expected: Vec3): void {
  expect(vAlmostEqual(actual, expected, 1e-9)).toBe(true);
}

describe('markerObjectPoints', () => {
  it('devuelve las cuatro esquinas en el orden de OpenCV', () => {
    const points = markerObjectPoints(SIZE);
    expect(points).toEqual([
      [-0.08, 0.08, 0],
      [0.08, 0.08, 0],
      [0.08, -0.08, 0],
      [-0.08, -0.08, 0],
    ]);
    expect(vDistance(points[0], points[2])).toBeCloseTo(SIZE * Math.SQRT2, 12);
    expect(vDistance(points[0], points[1])).toBeCloseTo(SIZE, 12);
  });

  it('rechaza tamaños no positivos', () => {
    expect(() => markerObjectPoints(0)).toThrow();
    expect(() => markerObjectPoints(-0.1)).toThrow();
  });
});

describe('markerPoseOnWall', () => {
  it('ubica y orienta marcadores en las cuatro paredes', () => {
    const cases = [
      {
        wall: 'north' as const,
        offset: 1.0,
        position: [1, 3, 1.2] as Vec3,
        x: [1, 0, 0] as Vec3,
        z: [0, -1, 0] as Vec3,
      },
      {
        wall: 'south' as const,
        offset: 1.0,
        position: [3, 0, 1.2] as Vec3,
        x: [-1, 0, 0] as Vec3,
        z: [0, 1, 0] as Vec3,
      },
      {
        wall: 'east' as const,
        offset: 1.5,
        position: [4, 1.5, 1.2] as Vec3,
        x: [0, -1, 0] as Vec3,
        z: [-1, 0, 0] as Vec3,
      },
      {
        wall: 'west' as const,
        offset: 1.5,
        position: [0, 1.5, 1.2] as Vec3,
        x: [0, 1, 0] as Vec3,
        z: [1, 0, 0] as Vec3,
      },
    ];

    for (const testCase of cases) {
      const pose = markerPoseOnWall(ROOM, {
        wall: testCase.wall,
        size_m: SIZE,
        offsetFromLeft_m: testCase.offset,
        height_m: 1.2,
      });
      expect(vAlmostEqual(pose.p, testCase.position, 1e-12)).toBe(true);
      expectDirection(applyDirection(pose, [1, 0, 0]), testCase.x);
      expectDirection(applyDirection(pose, [0, 1, 0]), [0, 0, 1]);
      expectDirection(applyDirection(pose, [0, 0, 1]), testCase.z);
    }
  });

  it('aplica el standoff hacia el interior', () => {
    const pose = markerPoseOnWall(ROOM, {
      wall: 'south',
      size_m: SIZE,
      offsetFromLeft_m: 1,
      height_m: 1.2,
      standoff_m: 0.01,
    });
    expect(vAlmostEqual(pose.p, [3, 0.01, 1.2], 1e-12)).toBe(true);
  });

  it('rechaza colocaciones fuera de la pared', () => {
    expect(() =>
      markerPoseOnWall(ROOM, {
        wall: 'south',
        size_m: SIZE,
        offsetFromLeft_m: 0.01,
        height_m: 1.2,
      }),
    ).toThrow();
    expect(() =>
      markerPoseOnWall(ROOM, {
        wall: 'north',
        size_m: SIZE,
        offsetFromLeft_m: 1,
        height_m: 0.05,
      }),
    ).toThrow();
  });
});

describe('config/marker_map.json', () => {
  const raw = readFileSync(
    new URL('../../../../config/marker_map.json', import.meta.url),
    'utf8',
  );
  const map = parseMarkerMap(JSON.parse(raw));

  it('tiene el formato y los IDs esperados', () => {
    expect(map.frame_id).toBe('world');
    expect(map.dictionary).toBe('APRILTAG_36h11');
    expect(map.markers).toHaveLength(PLACEMENTS.length);
    for (const placement of PLACEMENTS) {
      expect(findMarker(map, placement.id)).toBeDefined();
    }
  });

  it('coincide con markerPoseOnWall', () => {
    for (const placement of PLACEMENTS) {
      const marker = findMarker(map, placement.id);
      if (!marker) {
        throw new Error(`Falta el marcador ${placement.id}`);
      }
      expect(marker.size_m).toBeCloseTo(SIZE, 9);
      const expected = markerPoseOnWall(ROOM, placement);
      const actual = markerPose(marker);
      expect(
        mat4AlmostEqual(poseToMat4(actual), poseToMat4(expected), 1e-5),
      ).toBe(true);
    }
  });

  it('rechaza mapas con IDs duplicados', () => {
    const duplicated = {
      ...map,
      markers: [map.markers[0], map.markers[0]],
    };
    const result = safeParseMarkerMap(duplicated);
    expect(result.success).toBe(false);
  });

  it('rechaza un mapa con frame_id incorrecto', () => {
    const result = safeParseMarkerMap({ ...map, frame_id: 'odom' });
    expect(result.success).toBe(false);
  });
});
