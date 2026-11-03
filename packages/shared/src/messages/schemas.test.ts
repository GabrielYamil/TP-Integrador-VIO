import { describe, expect, it } from 'vitest';
import { parseClientMessage, parseClientMessageJson } from './schemas';

const POSE = {
  p: [0.1, 1.4, -0.2],
  q: [0, 0.3826834, 0, 0.9238795],
};

describe('parseClientMessage', () => {
  it('acepta un mensaje pose válido', () => {
    const result = parseClientMessage({
      type: 'pose',
      t: 1234.5,
      raw: POSE,
      corrected: POSE,
      tracking: 'tracking',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.type).toBe('pose');
      if (result.message.type === 'pose') {
        expect(result.message.raw.p).toEqual(POSE.p);
      }
    }
  });

  it('acepta pose sin corrección', () => {
    const result = parseClientMessage({
      type: 'pose',
      t: 0,
      raw: POSE,
      tracking: 'limited',
    });
    expect(result.ok).toBe(true);
  });

  it('acepta hello, marker y correction', () => {
    const hello = parseClientMessage({
      type: 'hello',
      device: 'Pixel 8',
      intrinsics: { fx: 500, fy: 501, cx: 320, cy: 240 },
      image_size: [640, 480],
    });
    expect(hello.ok).toBe(true);

    const marker = parseClientMessage({
      type: 'marker',
      t: 100,
      id: 3,
      T_cam_marker: POSE,
      reproj_err_px: 0.8,
    });
    expect(marker.ok).toBe(true);

    const correction = parseClientMessage({
      type: 'correction',
      t: 101,
      id: 3,
      delta_p_m: 0.04,
      delta_angle_rad: 0.01,
    });
    expect(correction.ok).toBe(true);
  });

  it('rechaza tipos, estados y quaterniones inválidos', () => {
    expect(
      parseClientMessage({
        type: 'pose',
        t: 1,
        raw: { p: [0, 0, 0], q: [0, 0, 0, 1] },
        tracking: 'ok',
      }).ok,
    ).toBe(false);

    expect(
      parseClientMessage({
        type: 'pose',
        t: -1,
        raw: { p: [0, 0, 0], q: [0, 0, 0, 1] },
        tracking: 'tracking',
      }).ok,
    ).toBe(false);

    expect(
      parseClientMessage({
        type: 'pose',
        t: 1,
        raw: { p: [0, 0], q: [0, 0, 0, 1] },
        tracking: 'tracking',
      }).ok,
    ).toBe(false);

    expect(
      parseClientMessage({
        type: 'pose',
        t: 1,
        raw: { p: [0, 0, 0], q: [0, 0, 0, 2] },
        tracking: 'tracking',
      }).ok,
    ).toBe(false);

    expect(
      parseClientMessage({
        type: 'pose',
        t: 1,
        raw: { p: [0, 0, 0], q: [0, 0, 0, 1] },
        tracking: 'tracking',
        extra: true,
      }).ok,
    ).toBe(false);
  });

  it('rechaza mensajes que no son objetos y tipos desconocidos', () => {
    expect(parseClientMessage(null).ok).toBe(false);
    expect(parseClientMessage([]).ok).toBe(false);
    expect(parseClientMessage({ type: 'otro' }).ok).toBe(false);
    expect(
      parseClientMessage({
        type: 'hello',
        device: '',
        intrinsics: { fx: 1, fy: 1, cx: 0, cy: 0 },
        image_size: [640, 480],
      }).ok,
    ).toBe(false);
    expect(
      parseClientMessage({
        type: 'hello',
        device: 'x',
        intrinsics: { fx: 1, fy: 1, cx: 0, cy: 0 },
        image_size: [0, 480],
      }).ok,
    ).toBe(false);
  });

  it('parsea JSON y describe el error', () => {
    const valid = parseClientMessageJson(
      JSON.stringify({
        type: 'pose',
        t: 1,
        raw: POSE,
        tracking: 'tracking',
      }),
    );
    expect(valid.ok).toBe(true);

    const invalidJson = parseClientMessageJson('{');
    expect(invalidJson.ok).toBe(false);
    if (!invalidJson.ok) {
      expect(invalidJson.error).toContain('JSON inválido');
    }

    const invalidMessage = parseClientMessageJson('{"type":"pose"}');
    expect(invalidMessage.ok).toBe(false);
    if (!invalidMessage.ok) {
      expect(invalidMessage.error.length).toBeGreaterThan(0);
    }
  });
});
