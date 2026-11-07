import { describe, expect, it } from 'vitest';
import { describeDevice } from './device-label';

describe('describeDevice', () => {
  it('extracts the Android model from the User-Agent', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A.240505.004) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36';
    expect(describeDevice(ua)).toBe('Pixel 8');
  });

  it('removes the WebView suffix and keeps the model', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 13; SM-S918B Build/TP1A.220624.014; wv) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36';
    expect(describeDevice(ua)).toBe('SM-S918B');
  });

  it('falls back to the Chrome version and then to the User-Agent', () => {
    expect(describeDevice('Mozilla/5.0 Chrome/126.0.6478.71 Safari/537.36')).toBe(
      'Chrome 126.0.6478.71',
    );
    expect(describeDevice('')).toBe('dispositivo desconocido');
  });

  it('truncates to the hello schema limit', () => {
    const long = 'x'.repeat(400);
    expect(describeDevice(long)).toHaveLength(256);
  });
});
