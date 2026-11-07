import { describe, expect, it } from 'vitest';
import { CLIENT_CONFIG, defaultIngestUrl, readRuntimeConfig } from './client-config';

const TEST_LOCATION = { protocol: 'https:', host: 'localhost:5173' } as const;

describe('readRuntimeConfig', () => {
  it('uses the defaults without query string', () => {
    const config = readRuntimeConfig('', TEST_LOCATION);
    expect(config.poseHz).toBe(CLIENT_CONFIG.poseHz);
    expect(config.camera).toEqual(CLIENT_CONFIG.camera);
    expect(config.warnings).toEqual([]);
    expect(config.ingestUrl).toBe('wss://localhost:5173/ingest');
  });

  it('reads pose, ingest and camera overrides', () => {
    const config = readRuntimeConfig(
      '?hz=15&ingest=wss%3A%2F%2F192.168.1.18%3A8443%2Fingest&camhz=5&camw=480&preview=0',
      TEST_LOCATION,
    );
    expect(config.poseHz).toBe(15);
    expect(config.camera.captureHz).toBe(5);
    expect(config.camera.maxDimension).toBe(480);
    expect(config.camera.preview).toBe(false);
    expect(config.ingestUrl).toBe('wss://192.168.1.18:8443/ingest');
    expect(config.warnings).toEqual([]);
  });

  it('accepts preview=true and rejects out-of-range values with warnings', () => {
    const config = readRuntimeConfig('?camhz=0&camw=9999&preview=quizas', TEST_LOCATION);
    expect(config.camera.captureHz).toBe(CLIENT_CONFIG.camera.captureHz);
    expect(config.camera.maxDimension).toBe(CLIENT_CONFIG.camera.maxDimension);
    expect(config.camera.preview).toBe(CLIENT_CONFIG.camera.preview);
    expect(config.warnings).toHaveLength(3);
  });

  it('falls back when the ingest URL is not ws or wss', () => {
    const config = readRuntimeConfig('?ingest=https%3A%2F%2Fexample.com', TEST_LOCATION);
    expect(config.ingestUrl).toBe('wss://localhost:5173/ingest');
    expect(config.warnings[0]).toContain('ingest');
  });
});

describe('defaultIngestUrl', () => {
  it('uses wss on HTTPS and ws on HTTP', () => {
    expect(defaultIngestUrl({ protocol: 'https:', host: 'phone.local:5173' })).toBe(
      'wss://phone.local:5173/ingest',
    );
    expect(defaultIngestUrl({ protocol: 'http:', host: 'localhost:8443' })).toBe(
      'ws://localhost:8443/ingest',
    );
  });
});
