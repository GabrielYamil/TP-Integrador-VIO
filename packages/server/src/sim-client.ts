/**
 * Simulador de cliente para probar el relay y Foxglove sin celular.
 *
 * Envía mensajes `hello` y `pose` a `/ingest` con una trayectoria sintética
 * (círculo o cuadrado) en la sala demo. Las poses `corrected` son la verdad
 * geométrica y las `raw` incluyen una deriva opcional (`--drift`) para que se
 * vean dos trayectorias distintas en Foxglove.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import WebSocket from 'ws';
import type { HelloMessage, Pose, PoseMessagePayload } from '@vio/shared';
import {
  compose,
  inverse,
  poseFromQuatTranslation,
  quatFromAxisAngle,
  worldFromOdomInitial,
} from '@vio/shared';
import { getArgument, hasFlag, parseNumberOption } from './cli';
import type { Logger, LogLevel } from './logging';
import { createLogger, parseLogLevel } from './logging';

export type SimTrajectory = 'circle' | 'square';

export interface SimulatorOptions {
  url: string;
  trajectory: SimTrajectory;
  rateHz: number;
  /** 0 = sin límite. */
  durationS: number;
  insecure: boolean;
  drift: boolean;
  device: string;
  logLevel: LogLevel;
}

export const SIM_DEFAULTS = {
  url: 'wss://localhost:8443/ingest',
  trajectory: 'circle' as SimTrajectory,
  rateHz: 30,
  durationS: 0,
  device: 'sim-client',
  roomCenterX: 2,
  roomCenterY: 1.5,
  circleRadiusM: 0.75,
  squareHalfSizeM: 0.7,
  heightM: 1.4,
  circlePeriodS: 20,
  squarePeriodS: 20,
  imageSize: [640, 480] as [number, number],
  intrinsics: { fx: 500, fy: 500, cx: 320, cy: 240 },
};

const DRIFT_TRANSLATION: [number, number, number] = [0.08, -0.05, 0.03];
const DRIFT_YAW_RAD = 0.05;

export function parseSimulatorArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): SimulatorOptions {
  const urlText = getArgument(argv, '--url') ?? env.VIO_SERVER_URL ?? SIM_DEFAULTS.url;
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    throw new Error(`URL inválida: ${urlText}`);
  }
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new Error(`La URL debe usar ws:// o wss://; recibido: ${urlText}`);
  }

  const trajectoryText = getArgument(argv, '--trajectory') ?? SIM_DEFAULTS.trajectory;
  if (trajectoryText !== 'circle' && trajectoryText !== 'square') {
    throw new Error(`--trajectory debe ser "circle" o "square"; recibido: ${trajectoryText}`);
  }

  const rateHz = parseNumberOption(
    getArgument(argv, '--rate'),
    '--rate',
    SIM_DEFAULTS.rateHz,
    0.5,
    120,
  );
  const durationS = parseNumberOption(
    getArgument(argv, '--duration'),
    '--duration',
    SIM_DEFAULTS.durationS,
    0,
    86_400,
  );
  const device = getArgument(argv, '--device') ?? SIM_DEFAULTS.device;
  if (device.length === 0 || device.length > 256) {
    throw new Error('--device debe tener entre 1 y 256 caracteres');
  }

  return {
    url: urlText,
    trajectory: trajectoryText,
    rateHz,
    durationS,
    insecure: hasFlag(argv, '--insecure') || env.VIO_INSECURE === '1',
    drift: hasFlag(argv, '--drift'),
    device,
    logLevel: parseLogLevel(getArgument(argv, '--log-level') ?? env.LOG_LEVEL, 'info'),
  };
}

/** Pose verdadera de la cámara en `world` para un tiempo de simulación. */
export function cameraPoseAt(trajectory: SimTrajectory, elapsedS: number): Pose {
  if (!Number.isFinite(elapsedS) || elapsedS < 0) {
    throw new Error(`Tiempo de simulación inválido: ${elapsedS}`);
  }
  return trajectory === 'circle' ? circlePose(elapsedS) : squarePose(elapsedS);
}

/** Transformación world<-odom simulada. Con `drift` se separa de la inicial. */
export function simulatedWorldOdom(drift: boolean): Pose {
  if (!drift) {
    return worldFromOdomInitial();
  }
  const driftPose = poseFromQuatTranslation(
    quatFromAxisAngle([0, 0, 1], DRIFT_YAW_RAD),
    DRIFT_TRANSLATION,
  );
  return compose(worldFromOdomInitial(), driftPose);
}

/** Construye el mensaje `pose` con la pose cruda derivada de la deriva. */
export function buildPoseMessage(
  truePose: Pose,
  T_world_odom: Pose,
  tMs: number,
): PoseMessagePayload {
  const raw = compose(inverse(T_world_odom), truePose);
  return {
    type: 'pose',
    t: tMs,
    raw,
    corrected: truePose,
    tracking: 'tracking',
  };
}

export function buildHelloMessage(device: string): HelloMessage {
  return {
    type: 'hello',
    device,
    intrinsics: { ...SIM_DEFAULTS.intrinsics },
    image_size: [...SIM_DEFAULTS.imageSize],
  };
}

function circlePose(elapsedS: number): Pose {
  const omega = (2 * Math.PI) / SIM_DEFAULTS.circlePeriodS;
  const angle = (elapsedS * omega) % (2 * Math.PI);
  const position: [number, number, number] = [
    SIM_DEFAULTS.roomCenterX + SIM_DEFAULTS.circleRadiusM * Math.cos(angle),
    SIM_DEFAULTS.roomCenterY + SIM_DEFAULTS.circleRadiusM * Math.sin(angle),
    SIM_DEFAULTS.heightM,
  ];
  // La cámara mira en la dirección de avance (tangente al círculo).
  const yaw = angle + Math.PI / 2;
  return poseFromQuatTranslation(quatFromAxisAngle([0, 0, 1], yaw), position);
}

function squarePose(elapsedS: number): Pose {
  const half = SIM_DEFAULTS.squareHalfSizeM;
  const side = 2 * half;
  const perimeter = 4 * side;
  const speed = perimeter / SIM_DEFAULTS.squarePeriodS;
  const distance = (elapsedS * speed) % perimeter;
  const corners: Array<[number, number]> = [
    [SIM_DEFAULTS.roomCenterX - half, SIM_DEFAULTS.roomCenterY - half],
    [SIM_DEFAULTS.roomCenterX + half, SIM_DEFAULTS.roomCenterY - half],
    [SIM_DEFAULTS.roomCenterX + half, SIM_DEFAULTS.roomCenterY + half],
    [SIM_DEFAULTS.roomCenterX - half, SIM_DEFAULTS.roomCenterY + half],
  ];

  let remaining = distance;
  for (let index = 0; index < 4; index += 1) {
    const start = corners[index]!;
    const end = corners[(index + 1) % 4]!;
    if (remaining <= side || index === 3) {
      const t = Math.min(1, remaining / side);
      const x = start[0] + (end[0] - start[0]) * t;
      const y = start[1] + (end[1] - start[1]) * t;
      const heading = Math.atan2(end[1] - start[1], end[0] - start[0]);
      return poseFromQuatTranslation(quatFromAxisAngle([0, 0, 1], heading), [
        x,
        y,
        SIM_DEFAULTS.heightM,
      ]);
    }
    remaining -= side;
  }

  // Inalcanzable: el último segmento siempre retorna.
  return poseFromQuatTranslation(quatFromAxisAngle([0, 0, 1], 0), [
    SIM_DEFAULTS.roomCenterX,
    SIM_DEFAULTS.roomCenterY,
    SIM_DEFAULTS.heightM,
  ]);
}

export async function runSimulator(options: SimulatorOptions, logger: Logger): Promise<void> {
  const url = new URL(options.url);
  const tlsOptions = buildTlsOptions(url, options.insecure);
  if (url.protocol === 'wss:') {
    if (options.insecure) {
      logger.warn('Verificación TLS deshabilitada por --insecure');
    } else if (tlsOptions.ca) {
      logger.info('Usando la CA local de certs/rootCA.pem');
    } else {
      logger.warn(
        'No se encontró certs/rootCA.pem; si el certificado es de mkcert, ' +
          'usá --insecure o definí VIO_CA_CERT.',
      );
    }
  }

  const T_world_odom = simulatedWorldOdom(options.drift);
  const hello = buildHelloMessage(options.device);
  const socket = new WebSocket(url, tlsOptions);
  const startedAt = Date.now();
  let sent = 0;
  let sentAtLastLog = 0;
  let lastLogAt = startedAt;
  let poseTimer: NodeJS.Timeout | null = null;
  let logTimer: NodeJS.Timeout | null = null;
  let durationTimer: NodeJS.Timeout | null = null;

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => {
      if (poseTimer) {
        clearInterval(poseTimer);
        poseTimer = null;
      }
      if (logTimer) {
        clearInterval(logTimer);
        logTimer = null;
      }
      if (durationTimer) {
        clearTimeout(durationTimer);
        durationTimer = null;
      }
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000, 'sim done');
      }
    };

    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    socket.once('open', () => {
      logger.info(
        `Conectado a ${options.url}; trayectoria=${options.trajectory}, ` +
          `tasa=${options.rateHz} Hz, device="${options.device}"` +
          `${options.drift ? ', con deriva simulada' : ''}`,
      );
      socket.send(JSON.stringify(hello));

      poseTimer = setInterval(() => {
        const now = Date.now();
        const elapsedS = (now - startedAt) / 1000;
        try {
          const truePose = cameraPoseAt(options.trajectory, elapsedS);
          const message = buildPoseMessage(truePose, T_world_odom, now);
          socket.send(JSON.stringify(message));
          sent += 1;
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      }, 1000 / options.rateHz);

      logTimer = setInterval(() => {
        const now = Date.now();
        const elapsedS = Math.max(0.001, (now - lastLogAt) / 1000);
        const rate = (sent - sentAtLastLog) / elapsedS;
        logger.info(`Enviados ${sent} mensajes pose (${rate.toFixed(1)}/s)`);
        sentAtLastLog = sent;
        lastLogAt = now;
      }, 5000);

      if (options.durationS > 0) {
        durationTimer = setTimeout(() => {
          logger.info(`Duración alcanzada: ${sent} mensajes enviados`);
          finish();
        }, options.durationS * 1000);
      }
    });

    socket.once('error', (error) => {
      finish(error instanceof Error ? error : new Error(String(error)));
    });

    socket.once('close', (code, reason) => {
      const reasonText = reason.toString('utf8');
      if (settled) {
        return;
      }
      if (code === 1000) {
        finish();
      } else {
        finish(
          new Error(`Conexión cerrada (code=${code}${reasonText ? `, reason=${reasonText}` : ''})`),
        );
      }
    });
  });
}

function buildTlsOptions(url: URL, insecure: boolean): WebSocket.ClientOptions {
  if (url.protocol === 'ws:') {
    return {};
  }
  if (insecure) {
    return { rejectUnauthorized: false };
  }
  const caPath =
    process.env.VIO_CA_CERT ?? fileURLToPath(new URL('../../../certs/rootCA.pem', import.meta.url));
  if (existsSync(caPath)) {
    return { ca: readFileSync(caPath) };
  }
  return {};
}

async function main(): Promise<void> {
  let options: SimulatorOptions;
  try {
    options = parseSimulatorArgs(process.argv.slice(2), process.env);
  } catch (error) {
    console.error('[sim]', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  const logger = createLogger('sim', options.logLevel);
  try {
    await runSimulator(options, logger);
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const entryPoint = process.argv[1];
if (entryPoint && pathToFileURL(entryPoint).href === import.meta.url) {
  void main();
}
