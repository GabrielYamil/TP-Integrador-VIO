import type { MarkerMap, Pose } from '@vio/shared';
import { worldFromOdomInitial } from '@vio/shared';
import { describe, expect, it } from 'vitest';
import { LocalizationCorrector } from './localization-corrector';

const sampleMap: MarkerMap = {
  frame_id: 'world',
  dictionary: 'APRILTAG_36h11',
  markers: [
    {
      id: 0,
      size_m: 0.16,
      position: [1.0, 2.0, 1.2],
      orientation_xyzw: [0, 0, 0, 1],
    },
    {
      id: 1,
      size_m: 0.16,
      position: [2.0, 0.0, 1.2],
      orientation_xyzw: [0, 0, 0, 1],
    },
  ],
};

const mockPoseOdomCam: Pose = {
  p: [0, 1, 0],
  q: [0, 0, 0, 1],
};

const mockPoseCamMarker: Pose = {
  p: [0, 0, 1],
  q: [0, 0, 0, 1],
};

describe('LocalizationCorrector', () => {
  it('starts uninitialized with default initial worldFromOdom', () => {
    const corrector = new LocalizationCorrector({ markerMap: sampleMap, mode: 'direct' });
    expect(corrector.isInitialized()).toBe(false);
    expect(corrector.getWorldOdom()).toEqual(worldFromOdomInitial());
  });

  it('rejects observations when mode is off or map is missing', () => {
    const correctorOff = new LocalizationCorrector({ markerMap: sampleMap, mode: 'off' });
    const resOff = correctorOff.processObservation({
      markerId: 0,
      t: 1000,
      T_odom_cam: mockPoseOdomCam,
      T_cam_marker: mockPoseCamMarker,
      reprojErrPx: 0.5,
    });
    expect(resOff.accepted).toBe(false);
    expect(resOff.reason).toBe('mode_off');

    const correctorNoMap = new LocalizationCorrector({ markerMap: null, mode: 'direct' });
    const resNoMap = correctorNoMap.processObservation({
      markerId: 0,
      t: 1000,
      T_odom_cam: mockPoseOdomCam,
      T_cam_marker: mockPoseCamMarker,
      reprojErrPx: 0.5,
    });
    expect(resNoMap.accepted).toBe(false);
    expect(resNoMap.reason).toBe('no_marker_map');
  });

  it('rejects markers with high reprojection error or unknown IDs', () => {
    const corrector = new LocalizationCorrector({ markerMap: sampleMap, mode: 'direct' });
    const resErr = corrector.processObservation({
      markerId: 0,
      t: 1000,
      T_odom_cam: mockPoseOdomCam,
      T_cam_marker: mockPoseCamMarker,
      reprojErrPx: 10.0,
    });
    expect(resErr.accepted).toBe(false);
    expect(resErr.reason).toBe('reproj_error_too_high');

    const resUnknown = corrector.processObservation({
      markerId: 99,
      t: 1000,
      T_odom_cam: mockPoseOdomCam,
      T_cam_marker: mockPoseCamMarker,
      reprojErrPx: 1.0,
    });
    expect(resUnknown.accepted).toBe(false);
    expect(resUnknown.reason).toBe('marker_not_in_map');
  });

  it('initializes on first valid observation and emits correction message', () => {
    const corrector = new LocalizationCorrector({ markerMap: sampleMap, mode: 'direct' });
    const res = corrector.processObservation({
      markerId: 0,
      t: 1000,
      T_odom_cam: mockPoseOdomCam,
      T_cam_marker: mockPoseCamMarker,
      reprojErrPx: 0.5,
    });

    expect(res.accepted).toBe(true);
    expect(corrector.isInitialized()).toBe(true);
    expect(res.message).toBeDefined();
    expect(res.message?.type).toBe('correction');
    expect(res.message?.id).toBe(0);
    expect(res.delta?.delta_p_m).toBeGreaterThan(0);
  });

  it('immediately updates T_world_odom in direct mode', () => {
    const corrector = new LocalizationCorrector({ markerMap: sampleMap, mode: 'direct' });
    const res1 = corrector.processObservation({
      markerId: 0,
      t: 1000,
      T_odom_cam: mockPoseOdomCam,
      T_cam_marker: mockPoseCamMarker,
      reprojErrPx: 0.5,
    });
    expect(res1.accepted).toBe(true);
    const poseAfter1 = corrector.getWorldOdom();

    // Small shift within allowed jump
    const shiftedCamMarker: Pose = { p: [0.05, 0, 1], q: [0, 0, 0, 1] };
    const res2 = corrector.processObservation({
      markerId: 0,
      t: 1100,
      T_odom_cam: mockPoseOdomCam,
      T_cam_marker: shiftedCamMarker,
      reprojErrPx: 0.5,
    });

    expect(res2.accepted).toBe(true);
    const poseAfter2 = corrector.getWorldOdom();
    expect(poseAfter2).not.toEqual(poseAfter1);
  });

  it('smoothly interpolates T_world_odom towards target in smooth mode', () => {
    const corrector = new LocalizationCorrector({
      markerMap: sampleMap,
      mode: 'smooth',
      smoothAlpha: 0.2,
    });

    // Step 1: Initialize
    corrector.processObservation({
      markerId: 0,
      t: 1000,
      T_odom_cam: mockPoseOdomCam,
      T_cam_marker: mockPoseCamMarker,
      reprojErrPx: 0.5,
    });
    const initPose = corrector.getWorldOdom();

    // Step 2: Shifted observation
    const shiftedCamMarker: Pose = { p: [0.1, 0, 1], q: [0, 0, 0, 1] };
    corrector.processObservation({
      markerId: 0,
      t: 1100,
      T_odom_cam: mockPoseOdomCam,
      T_cam_marker: shiftedCamMarker,
      reprojErrPx: 0.5,
    });

    const step2Pose = corrector.getWorldOdom();
    // In smooth mode, step2Pose moves towards target by alpha (20%), not 100% immediately
    expect(step2Pose.p[0]).not.toEqual(initPose.p[0]);

    // Tick advances smoothing step
    corrector.tick();
    const tickPose = corrector.getWorldOdom();
    expect(tickPose).toBeDefined();
  });

  it('rejects outlier jumps in position or angle once initialized', () => {
    const corrector = new LocalizationCorrector({
      markerMap: sampleMap,
      mode: 'direct',
      maxJumpPositionM: 0.5,
    });

    corrector.processObservation({
      markerId: 0,
      t: 1000,
      T_odom_cam: mockPoseOdomCam,
      T_cam_marker: mockPoseCamMarker,
      reprojErrPx: 0.5,
    });

    // Huge jump in observation (5 meters off)
    const wildPoseCamMarker: Pose = { p: [5.0, 0, 1], q: [0, 0, 0, 1] };
    const resJump = corrector.processObservation({
      markerId: 0,
      t: 1100,
      T_odom_cam: mockPoseOdomCam,
      T_cam_marker: wildPoseCamMarker,
      reprojErrPx: 0.5,
    });

    expect(resJump.accepted).toBe(false);
    expect(resJump.reason).toBe('outlier_jump_exceeded');
    expect(corrector.getStats().rejectedCount).toBe(1);
  });
});
