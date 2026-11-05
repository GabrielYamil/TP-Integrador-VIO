import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const certDir = fileURLToPath(new URL('../../certs/', import.meta.url));
const certPath = `${certDir}dev-cert.pem`;
const keyPath = `${certDir}dev-key.pem`;
const hasCerts = existsSync(certPath) && existsSync(keyPath);

if (!hasCerts) {
  console.warn(
    '[vite] No se encontraron certs/dev-cert.pem y certs/dev-key.pem. ' +
      'El servidor de desarrollo arrancará por HTTP (no sirve para WebXR en el celular). ' +
      'Ejecutá pnpm cert:setup.',
  );
}

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    https: hasCerts
      ? {
          cert: readFileSync(certPath),
          key: readFileSync(keyPath),
        }
      : undefined,
    proxy: {
      '/health': {
        target: 'https://127.0.0.1:8443',
        changeOrigin: true,
        secure: false,
      },
      // Permite que el cliente use el mismo origen también en desarrollo:
      // wss://IP:5173/ingest se reenvía al relay HTTPS de :8443.
      '/ingest': {
        target: 'https://127.0.0.1:8443',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
  preview: {
    host: true,
    port: 4173,
  },
  optimizeDeps: {
    exclude: ['@vio/shared'],
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        arTest: 'ar-test.html',
        mock: 'mock.html',
      },
    },
  },
});
