/**
 * Servidor de la Fase 2.
 *
 * - Sirve el build estático de packages/client/dist.
 * - Expone GET /health con el estado de la ingesta y de Foxglove.
 * - Monta el relay WebSocket seguro `/ingest` sobre el mismo servidor HTTPS.
 * - Publica la telemetría en un servidor Foxglove WebSocket en el puerto 8765.
 *
 * El flag `--http` queda para desarrollo de escritorio. WebXR y
 * `camera-access` exigen HTTPS en el celular.
 */
import { existsSync, readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { networkInterfaces } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { loadOptionalCameraCalibration } from './camera-calibration-loader';
import { getArgument, hasFlag, parseIntegerOption } from './cli';
import { FoxgloveGateway } from './foxglove';
import { IngestServer } from './ingest';
import { loadMarkerMap } from './marker-map-loader';
import { createLogger, parseLogLevel } from './logging';

interface PackageJson {
  version?: string;
}

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageJson;
const version = packageJson.version ?? '0.0.0';

const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));
const certsDir = fileURLToPath(new URL('../../../certs/', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const defaultMarkerMapPath = join(repoRoot, 'config', 'marker_map.json');
const defaultCameraCalibrationPath = join(repoRoot, 'config', 'camera_intrinsics.json');

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const useHttp = hasFlag(argv, '--http') || process.env.VIO_HTTP === '1';
  const port = parseIntegerOption(
    getArgument(argv, '--port') ?? process.env.PORT,
    '--port',
    8443,
    1,
    65535,
  );
  const host = getArgument(argv, '--host') ?? process.env.HOST ?? '0.0.0.0';
  const foxglovePort = parseIntegerOption(
    getArgument(argv, '--foxglove-port') ?? process.env.FOXGLOVE_PORT,
    '--foxglove-port',
    8765,
    1,
    65535,
  );
  const foxgloveHost =
    getArgument(argv, '--foxglove-host') ?? process.env.FOXGLOVE_HOST ?? '0.0.0.0';
  const markerMapPath =
    getArgument(argv, '--map') ?? process.env.MARKER_MAP_PATH ?? defaultMarkerMapPath;
  const cameraCalibrationPath =
    getArgument(argv, '--camera-intrinsics') ??
    process.env.CAMERA_INTRINSICS_PATH ??
    defaultCameraCalibrationPath;
  const logLevel = parseLogLevel(getArgument(argv, '--log-level') ?? process.env.LOG_LEVEL, 'info');
  const logger = createLogger('server', logLevel);

  if (foxglovePort === port && host === foxgloveHost) {
    throw new Error('El puerto de Foxglove no puede ser el mismo que el del servidor HTTPS');
  }

  const markerMap = loadMarkerMap(markerMapPath);
  logger.info(
    `Mapa: ${markerMap.markers.length} marcadores ${markerMap.dictionary} ` +
      `desde ${markerMapPath}`,
  );

  const cameraCalibration = loadOptionalCameraCalibration(cameraCalibrationPath);
  if (cameraCalibration.calibration) {
    logger.info(
      `Calibración de cámara: ${cameraCalibration.calibration.image_size[0]}×` +
        `${cameraCalibration.calibration.image_size[1]} desde ${cameraCalibrationPath}`,
    );
  } else if (cameraCalibration.error) {
    logger.warn(cameraCalibration.error);
  } else {
    logger.info(
      `Sin calibración de cámara en ${cameraCalibrationPath}; ` +
        'el cliente derivará los intrínsecos del XRView.',
    );
  }

  const gateway = new FoxgloveGateway({
    markerMap,
    logger: logger.child('foxglove'),
    host: foxgloveHost,
    port: foxglovePort,
  });

  const app = express();
  app.disable('x-powered-by');

  let ingest: IngestServer | undefined;

  app.get('/health', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.json({
      status: 'ok',
      service: 'vio-server',
      version,
      tls: !useHttp,
      now: Date.now(),
      uptime_s: Math.round(process.uptime()),
      marker_map: {
        dictionary: markerMap.dictionary,
        markers: markerMap.markers.length,
      },
      camera_intrinsics: {
        available: cameraCalibration.calibration !== null,
        error: cameraCalibration.error,
      },
      ingest: ingest?.getStats() ?? null,
      foxglove: gateway.getStats(),
    });
  });

  app.get('/config/camera_intrinsics.json', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (cameraCalibration.calibration) {
      response.json(cameraCalibration.calibration);
      return;
    }
    if (cameraCalibration.error) {
      response.status(503).json({
        error: 'camera_intrinsics_invalid',
        details: cameraCalibration.error,
      });
      return;
    }
    response.status(404).json({ error: 'camera_intrinsics_not_found' });
  });

  if (existsSync(clientDist)) {
    app.use(
      express.static(clientDist, {
        index: 'index.html',
        etag: true,
        maxAge: 0,
      }),
    );

    // Fallback para navegación de la multipágina. Solo responde a GET que
    // aceptan HTML y no parecen API ni archivos con extensión; las rutas de API
    // y los assets faltantes siguen dando 404.
    app.use((request, response, next) => {
      if (
        request.method !== 'GET' ||
        !request.accepts('html') ||
        request.path.startsWith('/api/') ||
        extname(request.path) !== ''
      ) {
        next();
        return;
      }
      response.sendFile(join(clientDist, 'index.html'));
    });
  } else {
    logger.warn(
      `No existe el build del cliente en ${clientDist}. ` + 'Ejecutá pnpm build para servirlo.',
    );
    app.get('/', (_request, response) => {
      response
        .status(503)
        .type('text/plain')
        .send('Cliente no compilado. Ejecutá pnpm build en la raíz del repo.');
    });
  }

  app.use((request, response) => {
    response.status(404).json({ error: 'not_found', path: request.path });
  });

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      logger.error('Error no manejado en Express:', error);
      response.status(500).json({ error: 'internal_error' });
    },
  );

  const server = useHttp ? createHttpServer(app) : createHttpsServer(readTlsOptions(), app);

  try {
    await gateway.listen();
    ingest = new IngestServer({
      server,
      logger: logger.child('ingest'),
      onMessage: (message, context) => {
        gateway.handleClientMessage(message, context);
      },
    });
    await listen(server, port, host);
  } catch (error) {
    await ingest?.close();
    await gateway.close();
    throw error;
  }

  server.on('error', (error) => {
    logger.error('Error de red:', error);
  });

  const protocol = useHttp ? 'http' : 'https';
  const wsProtocol = useHttp ? 'ws' : 'wss';
  logger.info(`VIO server v${version} escuchando en ${host}:${port}`);
  logger.info(`Local: ${protocol}://localhost:${port}`);
  for (const address of lanAddresses()) {
    logger.info(`LAN: ${protocol}://${address}:${port}`);
  }
  logger.info(`Ingest: ${wsProtocol}://localhost:${port}/ingest`);
  logger.info(`Foxglove: ws://localhost:${gateway.port}`);
  for (const address of lanAddresses()) {
    logger.info(`Foxglove LAN: ws://${address}:${gateway.port}`);
  }

  if (useHttp) {
    logger.warn(
      'Modo HTTP: solo para escritorio. WebXR y camera-access exigen HTTPS en el celular.',
    );
  } else {
    logger.info(`TLS: ${process.env.TLS_CERT ?? join(certsDir, 'dev-cert.pem')}`);
  }
  if (!existsSync(clientDist)) {
    logger.warn('/health funciona, pero el cliente no está compilado.');
  }

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      logger.warn('Segundo cierre solicitado; saliendo de inmediato.');
      process.exit(1);
    }
    shuttingDown = true;
    logger.info(`${signal} recibido, cerrando...`);
    const forceTimer = setTimeout(() => {
      logger.error('El cierre no terminó en 5 s; saliendo de forma forzada.');
      process.exit(1);
    }, 5000);
    forceTimer.unref();

    try {
      await ingest?.close();
      await gateway.close();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    } catch (error) {
      logger.error('Error al cerrar:', error);
    }

    clearTimeout(forceTimer);
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };
    server.once('listening', onListening);
    server.once('error', onError);
    server.listen(port, host);
  });
}

function lanAddresses(): string[] {
  const addresses = new Set<string>();
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.add(entry.address);
      }
    }
  }
  return [...addresses];
}

function readTlsOptions(): { key: Buffer; cert: Buffer } {
  const certPath = process.env.TLS_CERT ?? join(certsDir, 'dev-cert.pem');
  const keyPath = process.env.TLS_KEY ?? join(certsDir, 'dev-key.pem');
  if (!existsSync(certPath) || !existsSync(keyPath)) {
    throw new Error(
      'Faltan los certificados TLS:\n' +
        `  cert: ${certPath}\n` +
        `  key:  ${keyPath}\n` +
        '  Ejecutá pnpm cert:setup en una consola elevada.\n' +
        '  Para desarrollo de escritorio sin TLS: --http',
    );
  }
  return {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
  };
}

void main().catch((error: unknown) => {
  console.error('[server] No se pudo iniciar:', error instanceof Error ? error.message : error);
  process.exit(1);
});
