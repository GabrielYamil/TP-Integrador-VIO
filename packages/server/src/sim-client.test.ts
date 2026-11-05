import { describe, expect, it } from 'vitest';
import { compose, poseAlmostEqual, quatLength, worldFromOdomInitial } from '@vio/shared';
import {
  SIM_DEFAULTS,
  buildHelloMessage,
  buildPoseMessage,
  cameraPoseAt,
  parseSimulatorArgs,
  simulatedWorldOdom,
} from './sim-client';

describe('simulator arguments', () => {
  it('uses the defaults', () => {
    const options = parseSimulatorArgs([], {});
    expect(options.url).toBe(SIM_DEFAULTS.url);
    expect(options.trajectory).toBe('circle');
    expect(options.rateHz).toBe(SIM_DEFAULTS.rateHz);
    expect(options.durationS).toBe(0);
    expect(options.insecure).toBe(false);
    expect(options.drift).toBe(false);
    expect(options.device).toBe(SIM_DEFAULTS.device);
  });

  it('reads flags, environment, and custom values', () => {
    const options = parseSimulatorArgs(
      [
        '--url',
        'ws://127.0.0.1:9000/ingest',
        '--trajectory',
        'square',
        '--rate',
        '15',
        '--duration',
        '5',
        '--device',
        'Pixel 8',
        '--insecure',
        '--drift',
        '--log-level',
        'debug',
      ],
      {},
    );
    expect(options).toMatchObject({
      url: 'ws://127.0.0.1:9000/ingest',
      trajectory: 'square',
      rateHz: 15,
      durationS: 5,
      device: 'Pixel 8',
      insecure: true,
      drift: true,
      logLevel: 'debug',
    });

    const fromEnv = parseSimulatorArgs([], {
      VIO_SERVER_URL: 'wss://example.test/ingest',
      VIO_INSECURE: '1',
      LOG_LEVEL: 'warn',
    });
    expect(fromEnv.url).toBe('wss://example.test/ingest');
    expect(fromEnv.insecure).toBe(true);
    expect(fromEnv.logLevel).toBe('warn');
  });

  it('rejects invalid values', () => {
    expect(() => parseSimulatorArgs(['--url', 'http://localhost:8443/ingest'], {})).toThrow(
      /ws:\/\//,
    );
    expect(() => parseSimulatorArgs(['--trajectory', 'line'], {})).toThrow(/circle/);
    expect(() => parseSimulatorArgs(['--rate', '0'], {})).toThrow(/--rate/);
    expect(() => parseSimulatorArgs(['--duration', '-1'], {})).toThrow(/--duration/);
    expect(() => parseSimulatorArgs(['--device', ''], {})).toThrow(/--device/);
  });
});

describe('simulator geometry', () => {
  it('moves the camera on a circle at constant height', () => {
    const start = cameraPoseAt('circle', 0);
    expect(start.p[0]).toBeCloseTo(2.75, 9);
    expect(start.p[1]).toBeCloseTo(1.5, 9);
    expect(start.p[2]).toBeCloseTo(SIM_DEFAULTS.heightM, 9);
    expect(quatLength(start.q)).toBeCloseTo(1, 9);

    const quarter = cameraPoseAt('circle', SIM_DEFAULTS.circlePeriodS / 4);
    expect(quarter.p[0]).toBeCloseTo(2, 9);
    expect(quarter.p[1]).toBeCloseTo(2.25, 9);
    expect(quarter.p[2]).toBeCloseTo(SIM_DEFAULTS.heightM, 9);
  });

  it('walks a square inside the demo room', () => {
    const start = cameraPoseAt('square', 0);
    expect(start.p[0]).toBeCloseTo(1.3, 9);
    expect(start.p[1]).toBeCloseTo(0.8, 9);
    expect(start.p[2]).toBeCloseTo(SIM_DEFAULTS.heightM, 9);

    const half = SIM_DEFAULTS.squareHalfSizeM;
    const secondSegmentStart = cameraPoseAt('square', SIM_DEFAULTS.squarePeriodS / 4);
    expect(secondSegmentStart.p[0]).toBeCloseTo(2 + half, 9);
    expect(secondSegmentStart.p[1]).toBeCloseTo(1.5 - half, 9);

    const justAfterCorner = cameraPoseAt('square', SIM_DEFAULTS.squarePeriodS / 4 + 0.1);
    expect(justAfterCorner.p[0]).toBeCloseTo(2 + half, 9);
    expect(justAfterCorner.p[1]).toBeGreaterThan(1.5 - half);
  });

  it('derives raw poses from the simulated world<-odom drift', () => {
    const truePose = cameraPoseAt('circle', 3);
    const noDrift = simulatedWorldOdom(false);
    expect(poseAlmostEqual(noDrift, worldFromOdomInitial(), 1e-9, 1e-9)).toBe(true);

    const withDrift = simulatedWorldOdom(true);
    const message = buildPoseMessage(truePose, withDrift, 1_700_000_000_000);
    expect(message.type).toBe('pose');
    expect(message.tracking).toBe('tracking');
    expect(message.corrected).toEqual(truePose);
    expect(poseAlmostEqual(compose(withDrift, message.raw), truePose, 1e-9, 1e-9)).toBe(true);
    expect(poseAlmostEqual(withDrift, noDrift, 1e-9, 1e-9)).toBe(false);
  });

  it('builds a hello with the configured identity', () => {
    const hello = buildHelloMessage('Pixel 8');
    expect(hello).toMatchObject({
      type: 'hello',
      device: 'Pixel 8',
      image_size: [640, 480],
    });
    expect(hello.intrinsics.fx).toBeGreaterThan(0);
  });
});
