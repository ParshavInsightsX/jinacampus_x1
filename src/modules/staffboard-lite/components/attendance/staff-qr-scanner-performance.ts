export type ScannerFacingMode = "user" | "environment";
export type QrSourceCoverage = "square-preview" | "entire-source";

export type QrDecodePass = {
  canvasSlot: 0 | 1 | 2;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  maxOutputDimension: number;
  maxUpscale: number;
  inversionAttempts: "dontInvert" | "attemptBoth";
};

type CameraFocusCapabilities = {
  focusMode?: readonly string[];
};

const CAMERA_PROFILES = [
  { width: 1280, height: 720, frameRate: 30 },
  { width: 960, height: 540, frameRate: 24 }
] as const;

const WIDE_DECODE_MAX_DIMENSION = 960;
const FOCUSED_DECODE_MAX_DIMENSION = 1024;
const MIN_DECODE_INTERVAL_MS = 72;
const MAX_DECODE_INTERVAL_MS = 180;

export function buildCameraConstraintProfiles(
  preferredFacingMode: ScannerFacingMode,
  deviceId?: string
): MediaStreamConstraints[] {
  const selector = deviceId
    ? { deviceId: { exact: deviceId } }
    : { facingMode: { ideal: preferredFacingMode } };

  return [
    ...CAMERA_PROFILES.map((profile) => ({
      audio: false,
      video: {
        ...selector,
        width: { ideal: profile.width },
        height: { ideal: profile.height },
        frameRate: { ideal: profile.frameRate, max: 30 }
      }
    } satisfies MediaStreamConstraints)),
    { audio: false, video: true }
  ];
}

export function buildContinuousFocusConstraints(
  capabilities: CameraFocusCapabilities
): MediaTrackConstraints | null {
  if (!capabilities.focusMode?.includes("continuous")) return null;

  return {
    advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet]
  };
}

function centredSquarePass(
  frameWidth: number,
  frameHeight: number,
  ratio: number,
  canvasSlot: 1 | 2,
  inversionAttempts: QrDecodePass["inversionAttempts"]
): QrDecodePass {
  const size = Math.max(1, Math.min(frameWidth, frameHeight) * ratio);
  return {
    canvasSlot,
    sourceX: Math.max(0, (frameWidth - size) / 2),
    sourceY: Math.max(0, (frameHeight - size) / 2),
    sourceWidth: size,
    sourceHeight: size,
    maxOutputDimension: FOCUSED_DECODE_MAX_DIMENSION,
    maxUpscale: 1.75,
    inversionAttempts
  };
}

export function buildQrDecodePasses(
  frameWidth: number,
  frameHeight: number,
  sequence: number,
  sourceCoverage: QrSourceCoverage = "square-preview"
): QrDecodePass[] {
  if (frameWidth <= 0 || frameHeight <= 0) return [];

  const normalizedSequence = Math.abs(Math.trunc(sequence));
  const runInvertedWidePass = normalizedSequence % 6 === 5;
  const runTighterPass = normalizedSequence % 3 === 2;
  const visibleSize = Math.min(frameWidth, frameHeight);
  const useEntireSource = sourceCoverage === "entire-source";

  return [
    {
      canvasSlot: 0,
      sourceX: useEntireSource ? 0 : Math.max(0, (frameWidth - visibleSize) / 2),
      sourceY: useEntireSource ? 0 : Math.max(0, (frameHeight - visibleSize) / 2),
      sourceWidth: useEntireSource ? frameWidth : visibleSize,
      sourceHeight: useEntireSource ? frameHeight : visibleSize,
      maxOutputDimension: WIDE_DECODE_MAX_DIMENSION,
      maxUpscale: useEntireSource ? 1 : 1.25,
      inversionAttempts: runInvertedWidePass ? "attemptBoth" : "dontInvert"
    },
    centredSquarePass(
      frameWidth,
      frameHeight,
      runTighterPass ? 0.58 : 0.82,
      runTighterPass ? 2 : 1,
      "dontInvert"
    )
  ];
}

export function calculateAdaptiveDecodeIntervalMs(
  decodeDurationMs: number,
  hardwareConcurrency = 4
) {
  const baseInterval = hardwareConcurrency <= 2 ? 132 : hardwareConcurrency <= 4 ? 104 : 80;
  const workloadInterval = Math.ceil(Math.max(0, decodeDurationMs) * 1.15);
  return Math.min(
    MAX_DECODE_INTERVAL_MS,
    Math.max(MIN_DECODE_INTERVAL_MS, baseInterval, workloadInterval)
  );
}
