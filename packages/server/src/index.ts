/**
 * Servidor HTTPS mínimo de la Fase 0.
 *
 * - Sirve el build estático de packages/client/dist.
 * - Expone GET /health para la página de inicio.
 * - Deja preparado el flag --http para desarrollo en escritorio.
 *
 * El relay WebSocket y el servidor Foxglove se agregan en la Fase 2.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { networkInterfaces } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

interface PackageJson {
  version?: string;
}

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageJson;
const version = packageJson.version ?? '0.0.0';

const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));
const certsDir = fileURLToPath(new URL('../../../certs/', import.meta.url));

function getArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

const useHttp = process.argv.includes('--http') || process.env.VIO_HTTP === '1';
const port = Number(getArgument('--port') ?? process.env.PORT ?? 8443);
const host = getArgument('--host') ?? process.env.HOST ?? '0.0.0.0';

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Puerto inválido: ${port}`);
}

const app = express();
app.disable('x-powered-by');

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
  });
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
  console.warn(
    `[server] No existe el build del cliente en ${clientDist}. ` +
      'Ejecutá pnpm build para servirlo.',
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
    console.error('[server] Error no manejado:', error);
    response.status(500).json({ error: 'internal_error' });
  },
);

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
    console.error('[server] Faltan los certificados TLS:');
    console.error(`  cert: ${certPath}`);
    console.error(`  key:  ${keyPath}`);
    console.error('  Ejecutá pnpm cert:setup en una consola elevada.');
    console.error('  Para desarrollo de escritorio sin TLS: --http');
    process.exit(1);
  }
  return {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
  };
}

const server = useHttp ? createHttpServer(app) : createHttpsServer(readTlsOptions(), app);

server.on('error', (error) => {
  console.error('[server] Error de red:', error);
  process.exit(1);
});

server.listen(port, host, () => {
  const protocol = useHttp ? 'http' : 'https';
  console.log(`[server] VIO server v${version} escuchando en ${host}:${port}`);
  console.log(`[server] Local: ${protocol}://localhost:${port}`);
  for (const address of lanAddresses()) {
    console.log(`[server] LAN:   ${protocol}://${address}:${port}`);
  }
  if (useHttp) {
    console.warn(
      '[server] Modo HTTP: solo para escritorio. WebXR y camera-access exigen HTTPS en el celular.',
    );
  } else {
    console.log(`[server] TLS:   ${process.env.TLS_CERT ?? join(certsDir, 'dev-cert.pem')}`);
  }
  if (!existsSync(clientDist)) {
    console.warn('[server] /health funciona, pero el cliente no está compilado.');
  }
});

function shutdown(signal: string): void {
  console.log(`[server] ${signal} recibido, cerrando...`);
  server.close((error) => {
    if (error) {
      console.error('[server] Error al cerrar:', error);
      process.exit(1);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
