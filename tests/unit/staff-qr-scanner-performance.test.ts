import { describe, expect, it } from "vitest";
import {
  buildCameraConstraintProfiles,
  buildContinuousFocusConstraints,
  buildQrDecodePasses,
  calculateAdaptiveDecodeIntervalMs
} from "../../src/modules/staffboard-lite/components/attendance/staff-qr-scanner-performance";

describe("Staff QR scanner performance profiles", () => {
  it("requests practical camera profiles before the browser-safe fallback", () => {
    const profiles = buildCameraConstraintProfiles("environment");

    expect(profiles).toHaveLength(3);
    expect(profiles[0]).toMatchObject({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 }
      }
    });
    expect(profiles[1]).toMatchObject({
      video: {
        width: { ideal: 960 },
        height: { ideal: 540 },
        frameRate: { ideal: 24, max: 30 }
      }
    });
    expect(profiles[2]).toEqual({ audio: false, video: true });
  });

  it("keeps explicit camera switching scoped to the selected device", () => {
    const profiles = buildCameraConstraintProfiles("user", "camera-2");

    expect(profiles[0]).toMatchObject({
      video: { deviceId: { exact: "camera-2" } }
    });
    expect(profiles[0]).not.toHaveProperty("video.facingMode");
  });

  it("uses continuous focus only when the camera advertises support", () => {
    expect(buildContinuousFocusConstraints({ focusMode: ["manual", "continuous"] })).toEqual({
      advanced: [{ focusMode: "continuous" }]
    });
    expect(buildContinuousFocusConstraints({ focusMode: ["manual"] })).toBeNull();
    expect(buildContinuousFocusConstraints({})).toBeNull();
  });

  it("covers the full frame and alternates focused distance-friendly passes", () => {
    const normal = buildQrDecodePasses(1920, 1080, 0);
    const tighter = buildQrDecodePasses(1920, 1080, 2);
    const inverted = buildQrDecodePasses(1920, 1080, 5);

    expect(normal).toHaveLength(2);
    expect(normal[0]).toMatchObject({
      sourceX: 420,
      sourceY: 0,
      canvasSlot: 0,
      sourceWidth: 1080,
      sourceHeight: 1080,
      maxOutputDimension: 960,
      maxUpscale: 1.25,
      inversionAttempts: "dontInvert"
    });
    expect(normal[1].sourceWidth).toBeCloseTo(885.6);
    expect(normal[1].sourceHeight).toBeCloseTo(885.6);
    expect(normal[1].maxUpscale).toBe(1.75);
    expect(normal[1].canvasSlot).toBe(1);
    expect(tighter[1].sourceWidth).toBeCloseTo(626.4);
    expect(tighter[1].canvasSlot).toBe(2);
    expect(inverted[0].inversionAttempts).toBe("attemptBoth");

    expect(buildQrDecodePasses(1920, 1080, 0, "entire-source")[0]).toMatchObject({
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 1920,
      sourceHeight: 1080,
      maxUpscale: 1
    });
  });

  it("adapts decode frequency without starving fast or slower devices", () => {
    expect(calculateAdaptiveDecodeIntervalMs(10, 8)).toBe(80);
    expect(calculateAdaptiveDecodeIntervalMs(10, 4)).toBe(104);
    expect(calculateAdaptiveDecodeIntervalMs(10, 2)).toBe(132);
    expect(calculateAdaptiveDecodeIntervalMs(200, 8)).toBe(180);
  });
});
