/**
 * Web Worker para la detección de marcadores AprilTag y solución de PnP sin bloquear la UI.
 */
import cv from '@techstark/opencv-js';
import { MarkerDetector } from './marker-detector';
import type { WorkerRequest, WorkerResponse } from './worker-protocol';

let detector: MarkerDetector | null = null;
let cvInstance: any = null;

function postWorkerResponse(msg: WorkerResponse, transfer?: Transferable[]): void {
  (
    self as unknown as { postMessage: (msg: unknown, transfer?: Transferable[]) => void }
  ).postMessage(msg, transfer);
}

async function initCV(): Promise<void> {
  if (cvInstance) return;

  // Esperar a que la promesa/runtime de OpenCV esté lista
  const loadedCv = (cv as any).default ?? cv;
  if (loadedCv.Mat) {
    cvInstance = loadedCv;
  } else if (typeof loadedCv === 'function') {
    cvInstance = await loadedCv();
  } else if (loadedCv.then) {
    cvInstance = await loadedCv;
  } else {
    await new Promise<void>((resolve) => {
      if (loadedCv.onRuntimeInitialized) {
        const orig = loadedCv.onRuntimeInitialized;
        loadedCv.onRuntimeInitialized = () => {
          orig?.();
          resolve();
        };
      } else {
        resolve();
      }
    });
    cvInstance = loadedCv;
  }

  detector = new MarkerDetector(cvInstance);
  postWorkerResponse({ type: 'ready' });
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;

  if (req.type === 'init') {
    if (!cvInstance) {
      await initCV();
    }
    if (detector) {
      detector.setMarkerSizes(req.markerSizes ?? {}, req.defaultMarkerSize);
    }
    return;
  }

  if (req.type === 'detect') {
    const { t, width, height, intrinsics, buffer } = req;
    if (!detector) {
      try {
        await initCV();
      } catch (err) {
        postWorkerResponse(
          {
            type: 'error',
            error: `Error al inicializar OpenCV: ${String(err)}`,
            buffer,
          },
          [buffer],
        );
        return;
      }
    }

    try {
      const grayBuffer = new Uint8Array(buffer);
      const detections = detector!.detect(grayBuffer, width, height, intrinsics);

      postWorkerResponse(
        {
          type: 'detect_result',
          t,
          detections,
          buffer,
        },
        [buffer],
      );
    } catch (err) {
      postWorkerResponse(
        {
          type: 'error',
          error: `Error durante la detección: ${String(err)}`,
          buffer,
        },
        [buffer],
      );
    }
  }
};

// Iniciar carga de OpenCV al arrancar el Worker
initCV().catch((err) => {
  postWorkerResponse({
    type: 'error',
    error: `Error crítico al cargar OpenCV.js: ${String(err)}`,
  });
});
