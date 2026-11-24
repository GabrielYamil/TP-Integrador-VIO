/**
 * Detector de marcadores fiduciales AprilTag 36h11 y cálculo de pose PnP usando OpenCV.js.
 */
import type { CameraIntrinsics, Quat, Mat3 } from '@vio/shared';
import { quatFromMat3 } from '@vio/shared';
import type { MarkerDetectionResult } from './worker-protocol';

export interface MarkerDetectorOptions {
  defaultMarkerSize?: number;
  markerSizes?: Record<number, number>;
}

function firstNonEmptyData(mat: any, keys: string[], minimumLength = 1): ArrayLike<number> | null {
  for (const key of keys) {
    const data = mat?.[key] as ArrayLike<number> | undefined;
    if (data && data.length >= minimumLength) {
      return data;
    }
  }
  return null;
}

export class MarkerDetector {
  readonly #cv: any;
  #detector: any = null;
  #defaultMarkerSize: number;
  #markerSizes: Record<number, number>;

  constructor(cv: any, options: MarkerDetectorOptions = {}) {
    this.#cv = cv;
    this.#defaultMarkerSize = options.defaultMarkerSize ?? 0.16; // 16 cm por defecto
    this.#markerSizes = options.markerSizes ?? {};
    this.#initArucoDetector();
  }

  setMarkerSizes(markerSizes: Record<number, number>, defaultMarkerSize?: number): void {
    this.#markerSizes = { ...markerSizes };
    if (defaultMarkerSize && defaultMarkerSize > 0) {
      this.#defaultMarkerSize = defaultMarkerSize;
    }
  }

  #initArucoDetector(): void {
    const cv = this.#cv;
    const aruco = cv.aruco;
    const dictionaryId = cv.DICT_APRILTAG_36h11 ?? aruco?.DICT_APRILTAG_36h11;
    const getPredefinedDictionary = cv.getPredefinedDictionary ?? aruco?.getPredefinedDictionary;
    const DetectorParameters =
      cv.aruco_DetectorParameters ?? cv.DetectorParameters ?? aruco?.DetectorParameters;
    const ArucoDetector = cv.aruco_ArucoDetector ?? cv.ArucoDetector ?? aruco?.ArucoDetector;
    const RefineParameters =
      cv.aruco_RefineParameters ?? cv.RefineParameters ?? aruco?.RefineParameters;

    if (dictionaryId === undefined || typeof getPredefinedDictionary !== 'function') {
      throw new Error('OpenCV.js no expone el diccionario AprilTag 36h11');
    }
    if (typeof DetectorParameters !== 'function' || typeof ArucoDetector !== 'function') {
      throw new Error(
        'OpenCV.js no expone las APIs ArUco necesarias; usá un build que incluya el módulo objdetect',
      );
    }

    const dictionaryOwner = typeof cv.getPredefinedDictionary === 'function' ? cv : aruco;
    const dictionary = getPredefinedDictionary.call(dictionaryOwner, dictionaryId);
    const parameters = new DetectorParameters();
    const refineParameters =
      typeof RefineParameters === 'function' ? new RefineParameters(10, 3, true) : null;

    try {
      this.#detector = refineParameters
        ? new ArucoDetector(dictionary, parameters, refineParameters)
        : new ArucoDetector(dictionary, parameters);
    } finally {
      dictionary.delete?.();
      parameters.delete?.();
      refineParameters?.delete?.();
    }
  }

  /**
   * Detecta marcadores sobre una imagen en escala de grises y calcula T_cam_marker para cada uno.
   */
  detect(
    grayBuffer: Uint8Array,
    width: number,
    height: number,
    intrinsics: CameraIntrinsics,
  ): MarkerDetectionResult[] {
    const cv = this.#cv;
    if (!this.#detector) {
      throw new Error('Detector de marcadores no inicializado');
    }

    // Wrap buffer en cv.Mat (1 canal, uint8)
    const grayMat = cv.matFromArray(height, width, cv.CV_8UC1, Array.from(grayBuffer));

    const cornersVector = new cv.MatVector();
    const idsMat = new cv.Mat();
    const rejectedVector = new cv.MatVector();

    try {
      this.#detector.detectMarkers(grayMat, cornersVector, idsMat, rejectedVector);

      const numDetected = typeof idsMat.total === 'function' ? idsMat.total() : idsMat.rows;
      if (numDetected === 0) {
        return [];
      }

      const results: MarkerDetectionResult[] = [];
      const idsData = firstNonEmptyData(idsMat, ['data32S', 'data32F'], numDetected);
      const cornerCount =
        typeof cornersVector.size === 'function' ? cornersVector.size() : numDetected;

      if (!idsData || idsData.length < numDetected || cornerCount < numDetected) {
        throw new Error(
          `Salida ArUco incompleta: ids=${numDetected}, corners=${cornerCount}, idData=${idsData?.length ?? 0}`,
        );
      }

      for (let i = 0; i < numDetected; i++) {
        const id = idsData[i];
        const cornerMat = cornersVector.get(i);
        const data = firstNonEmptyData(cornerMat, ['data32F', 'data64F'], 8);
        if (!cornerMat || !data || data.length < 8) {
          cornerMat?.delete?.();
          throw new Error(`Esquinas ArUco inválidas para id=${id}: ${data?.length ?? 0} valores`);
        }

        // Esquinas 2D de la imagen: top-left, top-right, bottom-right, bottom-left
        const corners: [number, number][] = [
          [data[0], data[1]],
          [data[2], data[3]],
          [data[4], data[5]],
          [data[6], data[7]],
        ];

        const sizeM = this.#markerSizes[id] ?? this.#defaultMarkerSize;
        const pnpResult = this.#solvePnPForMarker(corners, sizeM, intrinsics);

        if (pnpResult) {
          results.push({
            id,
            T_cam_marker: pnpResult.T_cam_marker,
            reproj_err_px: pnpResult.reproj_err_px,
            corners,
          });
        }

        cornerMat.delete();
      }

      return results;
    } finally {
      grayMat.delete();
      cornersVector.delete();
      idsMat.delete();
      rejectedVector.delete();
    }
  }

  #solvePnPForMarker(
    corners: [number, number][],
    sizeM: number,
    intrinsics: CameraIntrinsics,
  ): { T_cam_marker: { p: [number, number, number]; q: Quat }; reproj_err_px: number } | null {
    const cv = this.#cv;
    const h = sizeM / 2;

    // 3D Object points (marco marker: z=0 plano)
    const objPointsData = [-h, h, 0, h, h, 0, h, -h, 0, -h, -h, 0];
    const objPoints = cv.matFromArray(4, 1, cv.CV_32FC3, objPointsData);

    // 2D Image points
    const imgPointsData = [
      corners[0][0],
      corners[0][1],
      corners[1][0],
      corners[1][1],
      corners[2][0],
      corners[2][1],
      corners[3][0],
      corners[3][1],
    ];
    const imgPoints = cv.matFromArray(4, 1, cv.CV_32FC2, imgPointsData);

    // Matriz de cámara K
    const cameraMatrixData = [
      intrinsics.fx,
      0,
      intrinsics.cx,
      0,
      intrinsics.fy,
      intrinsics.cy,
      0,
      0,
      1,
    ];
    const cameraMatrix = cv.matFromArray(3, 3, cv.CV_64FC1, cameraMatrixData);

    // Distorsión cero (WebXR ya rectificado)
    const distCoeffs = cv.matFromArray(4, 1, cv.CV_64FC1, [0, 0, 0, 0]);

    const rvec = new cv.Mat();
    const tvec = new cv.Mat();

    try {
      const pnpMethod =
        cv.SOLVEPNP_IPPE_SQUARE !== undefined
          ? cv.SOLVEPNP_IPPE_SQUARE
          : (cv.SOLVEPNP_ITERATIVE ?? 0);
      const ok = cv.solvePnP(
        objPoints,
        imgPoints,
        cameraMatrix,
        distCoeffs,
        rvec,
        tvec,
        false,
        pnpMethod,
      );
      if (!ok) {
        return null;
      }

      // Calcular error de reproyección
      const projPoints = new cv.Mat();
      let reproj_err_px: number;
      try {
        cv.projectPoints(objPoints, rvec, tvec, cameraMatrix, distCoeffs, projPoints);
        const projData = firstNonEmptyData(projPoints, ['data32F', 'data64F'], 8);
        if (!projData || projData.length < 8) {
          return null;
        }

        let totalErr = 0;
        for (let j = 0; j < 4; j++) {
          const dx = projData[j * 2] - corners[j][0];
          const dy = projData[j * 2 + 1] - corners[j][1];
          if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
            return null;
          }
          totalErr += Math.hypot(dx, dy);
        }
        reproj_err_px = totalErr / 4;
      } finally {
        projPoints.delete();
      }

      // Convertir rvec a matriz de rotación 3x3
      const R = new cv.Mat();
      try {
        cv.Rodrigues(rvec, R);
        const rData = firstNonEmptyData(R, ['data64F', 'data32F'], 9);
        const tData = firstNonEmptyData(tvec, ['data64F', 'data32F'], 3);
        if (!rData || rData.length < 9 || !tData || tData.length < 3) {
          return null;
        }

        // Rodrigues entrega matriz R en formato row-major.
        // Convertimos a column-major Mat3 para quatFromMat3:
        const mat3ColMajor: Mat3 = [
          rData[0],
          rData[3],
          rData[6],
          rData[1],
          rData[4],
          rData[7],
          rData[2],
          rData[5],
          rData[8],
        ];

        const q = quatFromMat3(mat3ColMajor);
        const p: [number, number, number] = [tData[0], tData[1], tData[2]];

        return {
          T_cam_marker: { p, q },
          reproj_err_px,
        };
      } finally {
        R.delete();
      }
    } catch {
      return null;
    } finally {
      objPoints.delete();
      imgPoints.delete();
      cameraMatrix.delete();
      distCoeffs.delete();
      rvec.delete();
      tvec.delete();
    }
  }
}
