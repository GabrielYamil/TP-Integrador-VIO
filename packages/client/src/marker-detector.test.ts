import { describe, expect, it } from 'vitest';
import type { CameraIntrinsics } from '@vio/shared';
import { createRequire } from 'node:module';
import { MarkerDetector } from './marker-detector';

/**
 * Mock minimal de OpenCV.js para validar la lógica de PnP y la llamada al detector.
 */
function createMockCV(markerIds: number[] = [0]) {
  return {
    DICT_APRILTAG_36h11: 0,
    CV_8UC1: 0,
    CV_32FC1: 1,
    CV_32FC2: 2,
    CV_32FC3: 3,
    CV_64FC1: 4,
    SOLVEPNP_IPPE_SQUARE: 11,

    getPredefinedDictionary: (_id: number) => ({ name: 'APRILTAG_36h11' }),
    aruco_DetectorParameters: class {},
    aruco_RefineParameters: class {},

    aruco_ArucoDetector: class {
      detectMarkers(_grayMat: any, cornersVector: any, idsMat: any, _rejectedVector: any) {
        idsMat.rows = markerIds.length > 0 ? 1 : 0;
        idsMat.data32S = new Int32Array(markerIds);

        const cornerMat = {
          data32F: new Float32Array([
            100,
            100, // Top-left
            200,
            100, // Top-right
            200,
            200, // Bottom-right
            100,
            200, // Bottom-left
          ]),
          delete: () => {},
        };
        cornersVector.get = (_idx: number) => cornerMat;
      }
    },

    matFromArray: (_rows: number, _cols: number, _type: number, array: number[]) => ({
      data32F: new Float32Array(array),
      data64F: new Float64Array(array),
      delete: () => {},
    }),

    MatVector: class {
      delete() {}
    },
    Mat: class {
      rows = 0;
      data32S = new Int32Array(0);
      total() {
        return this.data32S.length;
      }
      delete() {}
    },

    solvePnP: (
      _obj: any,
      _img: any,
      _cam: any,
      _dist: any,
      _rvec: any,
      tvec: any,
      _useGuess: boolean,
      _method: number,
    ) => {
      // Simular tvec = [0.1, 0.2, 1.0] (1 metro al frente)
      tvec.data64F = new Float64Array([0.1, 0.2, 1.0]);
      return true;
    },

    projectPoints: (_obj: any, _rvec: any, _tvec: any, _cam: any, _dist: any, projPoints: any) => {
      // OpenCV 5 emits projected points as float32 for float32 object points.
      projPoints.data64F = new Float64Array(8).fill(Number.NaN);
      projPoints.data32F = new Float32Array([
        100.2, 100.1, 200.1, 100.3, 199.9, 200.2, 100.1, 199.8,
      ]);
    },

    Rodrigues: (_rvec: any, R: any) => {
      // Matriz Identidad
      R.data64F = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    },
  };
}

describe('MarkerDetector', () => {
  it('inicializa el detector y detecta un marcador con mock OpenCV', () => {
    const mockCv = createMockCV();
    const detector = new MarkerDetector(mockCv, {
      defaultMarkerSize: 0.16,
      markerSizes: { 0: 0.16 },
    });

    const grayBuffer = new Uint8Array(640 * 480);
    const intrinsics: CameraIntrinsics = {
      fx: 500,
      fy: 500,
      cx: 320,
      cy: 240,
    };

    const results = detector.detect(grayBuffer, 640, 480, intrinsics);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(0);
    expect(results[0].T_cam_marker.p).toEqual([0.1, 0.2, 1.0]);
    expect(results[0].T_cam_marker.q).toBeDefined();
    expect(results[0].reproj_err_px).toBeLessThan(1.0);
    expect(results[0].corners).toHaveLength(4);
  });

  it('initializes the flattened OpenCV 5 ArUco API', () => {
    let refineArguments: [number, number, boolean] | undefined;
    let detectorArguments: unknown[] = [];
    const mockCv = {
      ...createMockCV(),
      DetectorParameters: undefined,
      ArucoDetector: undefined,
      aruco_DetectorParameters: class {
        delete() {}
      },
      aruco_RefineParameters: class {
        constructor(...args: [number, number, boolean]) {
          refineArguments = args;
        }

        delete() {}
      },
      aruco_ArucoDetector: class {
        constructor(...args: unknown[]) {
          detectorArguments = args;
        }
      },
    };

    new MarkerDetector(mockCv);

    expect(refineArguments).toEqual([10, 3, true]);
    expect(detectorArguments).toHaveLength(3);
  });

  it('counts all IDs when OpenCV returns a single-row IDs matrix', () => {
    const detector = new MarkerDetector(createMockCV([0, 1]));
    const detections = detector.detect(new Uint8Array(640 * 480), 640, 480, {
      fx: 500,
      fy: 500,
      cx: 320,
      cy: 240,
    });

    expect(detections.map(({ id }) => id)).toEqual([0, 1]);
  });

  it('permite actualizar el tamaño de los marcadores dinámicamente', () => {
    const mockCv = createMockCV();
    const detector = new MarkerDetector(mockCv);
    detector.setMarkerSizes({ 3: 0.2 }, 0.15);

    const grayBuffer = new Uint8Array(100);
    const intrinsics: CameraIntrinsics = { fx: 500, fy: 500, cx: 320, cy: 240 };
    const results = detector.detect(grayBuffer, 10, 10, intrinsics);

    expect(results).toHaveLength(1);
  });

  it('encuentra la API AprilTag en el paquete OpenCV.js instalado', async () => {
    const require = createRequire(import.meta.url);
    const cv = await require('@techstark/opencv-js');

    expect(cv.DICT_APRILTAG_36h11).toBeDefined();
    expect(cv.getPredefinedDictionary).toBeTypeOf('function');
    expect(cv.aruco_DetectorParameters).toBeTypeOf('function');
    expect(cv.aruco_ArucoDetector).toBeTypeOf('function');

    const dictionary = cv.getPredefinedDictionary(cv.DICT_APRILTAG_36h11);
    const marker = new cv.Mat();
    const image = new cv.Mat();
    cv.generateImageMarker(dictionary, 0, 400, marker);
    cv.copyMakeBorder(marker, image, 50, 50, 50, 50, cv.BORDER_CONSTANT, new cv.Scalar(255));

    const detector = new MarkerDetector(cv, { defaultMarkerSize: 0.16 });
    const results = detector.detect(new Uint8Array(image.data), image.cols, image.rows, {
      fx: 500,
      fy: 500,
      cx: 250,
      cy: 250,
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(0);
    expect(results[0].corners).toEqual([
      [50, 50],
      [449, 50],
      [449, 449],
      [50, 449],
    ]);
    expect(results[0].reproj_err_px).toBeLessThan(1);
    expect(results[0].T_cam_marker.p[2]).toBeGreaterThan(0);

    marker.delete();
    image.delete();
    dictionary.delete?.();
  }, 30_000);
});
