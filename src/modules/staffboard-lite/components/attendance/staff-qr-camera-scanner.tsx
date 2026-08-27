"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import {
  Camera,
  Flashlight,
  FlashlightOff,
  ImageUp,
  Loader2,
  RotateCcw,
  ScanLine,
  Square,
  SwitchCamera,
  VideoOff
} from "lucide-react";

type StaffQrCameraScannerProps = {
  autoStart?: boolean;
  continuous?: boolean;
  disabled?: boolean;
  preferredFacingMode?: "user" | "environment";
  processing?: boolean;
  rearmSignal?: number;
  showPrimaryControls?: boolean;
  variant?: "default" | "mobile";
  title?: string;
  description?: string;
  onQrPayloadDetected: (qrPayload: string) => void;
};

type ScannerStatus =
  | "idle"
  | "checking-support"
  | "requesting-permission"
  | "camera-active"
  | "processing"
  | "detected"
  | "unsupported"
  | "in-app-browser"
  | "permission-denied"
  | "https-required"
  | "camera-unavailable"
  | "timeout"
  | "error";

type CameraDiagnostics = {
  isSecureContext: boolean;
  hasMediaDevices: boolean;
  hasGetUserMedia: boolean;
  isLikelyInAppBrowser: boolean;
  origin: string;
  userAgent: string;
};

type ImageDecodeStatus = "idle" | "decoding" | "error";

type CameraDevice = {
  deviceId: string;
  label: string;
};

type TorchCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
};

type TorchConstraintSet = MediaTrackConstraintSet & {
  torch?: boolean;
};

const CAMERA_REQUEST_TIMEOUT_MS = 12_000;
const QR_ABSENT_FRAME_THRESHOLD = 8;

const FALLBACK_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: true
};

function preferredCameraConstraints(
  preferredFacingMode: "user" | "environment",
  deviceId?: string
): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: preferredFacingMode } }),
      width: { ideal: 1280 },
      height: { ideal: 1280 }
    }
  };
}

class CameraTimeoutError extends Error {
  constructor() {
    super("Camera permission request timed out.");
    this.name = "CameraTimeoutError";
  }
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function isLikelyInAppBrowser(userAgent: string) {
  return /FBAN|FBAV|Instagram|Line\/|LinkedInApp|MicroMessenger|Twitter|WhatsApp/i.test(userAgent);
}

function getCameraDiagnostics(): CameraDiagnostics {
  if (typeof window === "undefined") {
    return {
      isSecureContext: false,
      hasMediaDevices: false,
      hasGetUserMedia: false,
      isLikelyInAppBrowser: false,
      origin: "Unavailable during server rendering",
      userAgent: "Unavailable during server rendering"
    };
  }

  const mediaDevices = navigator.mediaDevices;
  const userAgent = navigator.userAgent || "Unknown browser";
  return {
    isSecureContext: window.isSecureContext === true,
    hasMediaDevices: Boolean(mediaDevices),
    hasGetUserMedia: typeof mediaDevices?.getUserMedia === "function",
    isLikelyInAppBrowser: isLikelyInAppBrowser(userAgent),
    origin: window.location.origin,
    userAgent
  };
}

function logCameraDiagnostics(eventName: string, diagnostics: CameraDiagnostics) {
  console.info("[JinaCampus Staff QR camera]", {
    eventName,
    isSecureContext: diagnostics.isSecureContext,
    hasMediaDevices: diagnostics.hasMediaDevices,
    hasGetUserMedia: diagnostics.hasGetUserMedia,
    isLikelyInAppBrowser: diagnostics.isLikelyInAppBrowser,
    origin: diagnostics.origin,
    userAgent: diagnostics.userAgent
  });
}

function waitForPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function getUserMediaWithTimeout(mediaDevices: MediaDevices, constraints: MediaStreamConstraints) {
  let timeoutId: number | undefined;
  let didTimeOut = false;
  const streamPromise = mediaDevices.getUserMedia(constraints);
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      didTimeOut = true;
      reject(new CameraTimeoutError());
    }, CAMERA_REQUEST_TIMEOUT_MS);
  });

  streamPromise.then(
    (stream) => {
      if (didTimeOut) stopMediaStream(stream);
    },
    () => undefined
  );

  try {
    return await Promise.race([streamPromise, timeoutPromise]);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
}

function isConstraintFailure(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "OverconstrainedError" || error.name === "ConstraintNotSatisfiedError")
  );
}

async function requestCameraStream(
  mediaDevices: MediaDevices,
  preferredFacingMode: "user" | "environment",
  deviceId?: string
) {
  try {
    return await getUserMediaWithTimeout(
      mediaDevices,
      preferredCameraConstraints(preferredFacingMode, deviceId)
    );
  } catch (error) {
    if (isConstraintFailure(error)) {
      return getUserMediaWithTimeout(mediaDevices, FALLBACK_CAMERA_CONSTRAINTS);
    }
    throw error;
  }
}

function qrPayloadFingerprint(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function cameraErrorMessage(error: unknown) {
  if (error instanceof CameraTimeoutError) {
    return {
      status: "timeout" as const,
      message:
        "Camera permission request timed out. Reopen the approved HTTPS link, check browser camera permission, and retry."
    };
  }

  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return {
        status: "permission-denied" as const,
        message: "Camera permission was denied. Please allow camera access in Safari settings and retry."
      };
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return {
        status: "camera-unavailable" as const,
        message: "No camera was found on this device. Please use manual token entry."
      };
    }
    if (isConstraintFailure(error)) {
      return {
        status: "camera-unavailable" as const,
        message: "No usable camera was found on this device. Please use manual token entry."
      };
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError" || error.name === "AbortError") {
      return {
        status: "camera-unavailable" as const,
        message: "Camera is already in use or blocked by the device/browser."
      };
    }
  }

  return {
    status: "error" as const,
    message: "Unknown camera error. Please retry, reopen the approved HTTPS link, or use manual token entry."
  };
}

function statusLabel(status: ScannerStatus) {
  switch (status) {
    case "checking-support":
      return "Checking support";
    case "requesting-permission":
      return "Requesting camera permission";
    case "camera-active":
      return "Camera active";
    case "processing":
      return "Verifying attendance";
    case "https-required":
      return "HTTPS required";
    case "permission-denied":
      return "Permission denied";
    case "camera-unavailable":
      return "Camera unavailable";
    case "unsupported":
      return "Unsupported browser";
    case "in-app-browser":
      return "In-app browser";
    case "timeout":
      return "Camera timeout";
    case "detected":
      return "QR detected";
    case "error":
      return "Unknown camera error";
    case "idle":
    default:
      return "Idle";
  }
}

function decodeQrFromCanvas(
  canvas: HTMLCanvasElement,
  source: HTMLVideoElement | HTMLImageElement,
  width: number,
  height: number,
  cropToSquare = false
) {
  if (width <= 0 || height <= 0) return null;

  const sourceSize = cropToSquare ? Math.min(width, height) : null;
  const sourceX = sourceSize ? Math.max(0, (width - sourceSize) / 2) : 0;
  const sourceY = sourceSize ? Math.max(0, (height - sourceSize) / 2) : 0;
  const sourceWidth = sourceSize ?? width;
  const sourceHeight = sourceSize ?? height;
  const scale = Math.min(1, 960 / Math.max(sourceWidth, sourceHeight));
  const canvasWidth = Math.max(1, Math.round(sourceWidth * scale));
  const canvasHeight = Math.max(1, Math.round(sourceHeight * scale));

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(
    source,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvasWidth,
    canvasHeight
  );
  const imageData = context.getImageData(0, 0, canvasWidth, canvasHeight);
  const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth"
  });

  return qrCode?.data?.trim() || null;
}

function loadImageFromObjectUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("QR_IMAGE_LOAD_FAILED"));
    image.src = url;
  });
}

export function StaffQrCameraScanner({
  autoStart = false,
  continuous = false,
  disabled,
  preferredFacingMode = "environment",
  processing = false,
  rearmSignal = 0,
  showPrimaryControls = true,
  variant = "default",
  title = "Scan QR",
  description = "Place the live school QR inside the square. Attendance submits automatically when the code is detected.",
  onQrPayloadDetected
}: StaffQrCameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const cameraRequestIdRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const decodedRef = useRef(false);
  const blockedFingerprintRef = useRef<string | null>(null);
  const qrAbsentFrameCountRef = useRef(0);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [message, setMessage] = useState("Allow camera access to scan the QR code displayed at the school office or gate.");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<CameraDiagnostics | null>(null);
  const [imageDecodeStatus, setImageDecodeStatus] = useState<ImageDecodeStatus>("idle");
  const [imageDecodeMessage, setImageDecodeMessage] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
  const [activeCameraDeviceId, setActiveCameraDeviceId] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [cameraControlMessage, setCameraControlMessage] = useState<string | null>(null);

  const clearVideoPreview = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    videoElement.pause();
    videoElement.srcObject = null;
    videoElement.removeAttribute("src");
    videoElement.load();
  }, []);

  const stopDecodeLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const stopActiveCamera = useCallback(() => {
    stopDecodeLoop();
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    clearVideoPreview();
    setTorchEnabled(false);
    setTorchSupported(false);
  }, [clearVideoPreview, stopDecodeLoop]);

  const stopCameraSession = useCallback(() => {
    cameraRequestIdRef.current += 1;
    stopActiveCamera();
    decodedRef.current = false;
    blockedFingerprintRef.current = null;
    qrAbsentFrameCountRef.current = 0;
  }, [stopActiveCamera]);

  const submitDetectedPayload = useCallback((qrPayload: string) => {
    if (decodedRef.current) return;

    decodedRef.current = true;
    blockedFingerprintRef.current = qrPayloadFingerprint(qrPayload);
    qrAbsentFrameCountRef.current = 0;
    stopDecodeLoop();
    if (!continuous) stopActiveCamera();
    setStatus("detected");
    setCameraError(null);
    setMessage("QR detected. Submitting attendance...");
    onQrPayloadDetected(qrPayload);
  }, [continuous, onQrPayloadDetected, stopActiveCamera, stopDecodeLoop]);

  const scanVideoFrame = useCallback(() => {
    animationFrameRef.current = null;
    if (decodedRef.current || !streamRef.current) return;

    const videoElement = videoRef.current;
    if (videoElement && videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;
      const qrPayload = decodeQrFromCanvas(
        canvas,
        videoElement,
        videoElement.videoWidth,
        videoElement.videoHeight,
        true
      );
      if (qrPayload) {
        qrAbsentFrameCountRef.current = 0;
        if (qrPayloadFingerprint(qrPayload) === blockedFingerprintRef.current) {
          animationFrameRef.current = window.requestAnimationFrame(scanVideoFrame);
          return;
        }
        submitDetectedPayload(qrPayload);
        return;
      }

      if (blockedFingerprintRef.current) {
        qrAbsentFrameCountRef.current += 1;
        if (qrAbsentFrameCountRef.current >= QR_ABSENT_FRAME_THRESHOLD) {
          blockedFingerprintRef.current = null;
          qrAbsentFrameCountRef.current = 0;
        }
      }
    }

    animationFrameRef.current = window.requestAnimationFrame(scanVideoFrame);
  }, [submitDetectedPayload]);

  const startDecodeLoop = useCallback(() => {
    stopDecodeLoop();
    animationFrameRef.current = window.requestAnimationFrame(scanVideoFrame);
  }, [scanVideoFrame, stopDecodeLoop]);

  const updateCameraControls = useCallback(
    async (stream: MediaStream, mediaDevices: MediaDevices, requestId: number) => {
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) return;

      const settings = videoTrack.getSettings();
      const capabilities =
        typeof videoTrack.getCapabilities === "function"
          ? (videoTrack.getCapabilities() as TorchCapabilities)
          : ({} as TorchCapabilities);
      let cameraDevices: CameraDevice[] = [];

      try {
        const devices = await mediaDevices.enumerateDevices();
        cameraDevices = devices
          .filter((device) => device.kind === "videoinput" && Boolean(device.deviceId))
          .map((device, index) => ({
            deviceId: device.deviceId,
            label: device.label || `Camera ${index + 1}`
          }));
      } catch {
        cameraDevices = [];
      }

      if (!mountedRef.current || cameraRequestIdRef.current !== requestId) return;
      setAvailableCameras(cameraDevices);
      setActiveCameraDeviceId(settings.deviceId ?? cameraDevices[0]?.deviceId ?? null);
      setTorchSupported(capabilities.torch === true);
      setTorchEnabled(false);
    },
    []
  );

  const stopScanner = useCallback((nextStatus: ScannerStatus = "idle") => {
    stopCameraSession();
    setStatus(nextStatus);
    if (nextStatus === "idle") {
      setMessage("Camera stopped. You can start it again or use manual token entry.");
    }
  }, [stopCameraSession]);

  useEffect(() => {
    mountedRef.current = true;
    setDiagnostics(getCameraDiagnostics());
    return () => {
      mountedRef.current = false;
      stopCameraSession();
    };
  }, [stopCameraSession]);

  useEffect(() => {
    const stopForPageLifecycle = () => {
      stopScanner("idle");
    };
    const stopWhenHidden = () => {
      if (document.visibilityState === "hidden") {
        stopScanner("idle");
        return;
      }
      if (autoStart && !disabled) {
        window.setTimeout(() => void startCamera(), 0);
      }
    };

    window.addEventListener("pagehide", stopForPageLifecycle);
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => {
      window.removeEventListener("pagehide", stopForPageLifecycle);
      document.removeEventListener("visibilitychange", stopWhenHidden);
    };
  }, [autoStart, disabled, processing, status, stopScanner]);

  useEffect(() => {
    if (!autoStart || disabled) return;
    const timeoutId = window.setTimeout(() => void startCamera(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [autoStart, disabled]);

  useEffect(() => {
    if (!disabled) return;
    stopCameraSession();
    setStatus("idle");
    setMessage("Camera stopped because the attendance scanner is not active.");
  }, [disabled, stopCameraSession]);

  useEffect(() => {
    if (!continuous || !streamRef.current || disabled || processing) return;
    decodedRef.current = false;
    setStatus("camera-active");
    setCameraError(null);
    setMessage("Ready for the next staff Attendance QR.");
    startDecodeLoop();
  }, [continuous, rearmSignal, startDecodeLoop]);

  async function startCamera(deviceId?: string, replaceActiveCamera = false) {
    if (
      disabled ||
      processing ||
      status === "checking-support" ||
      status === "requesting-permission" ||
      (status === "camera-active" && !replaceActiveCamera)
    ) {
      return;
    }

    const requestId = cameraRequestIdRef.current + 1;
    cameraRequestIdRef.current = requestId;
    decodedRef.current = false;

    const currentDiagnostics = getCameraDiagnostics();
    setDiagnostics(currentDiagnostics);
    logCameraDiagnostics("start_camera_tap", currentDiagnostics);
    setStatus("checking-support");
    setCameraError(null);
    setImageDecodeMessage(null);
    setCameraControlMessage(null);
    setMessage("Checking camera support...");

    await waitForPaint();

    if (!currentDiagnostics.isSecureContext) {
      setStatus("https-required");
      setCameraError("Camera requires a secure HTTPS connection. Please open the approved HTTPS pilot link.");
      setMessage("Camera was not started because this page is not running in a secure browser context.");
      return;
    }

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      setStatus(currentDiagnostics.isLikelyInAppBrowser ? "in-app-browser" : "unsupported");
      setCameraError(
        currentDiagnostics.isLikelyInAppBrowser
          ? "This looks like an in-app browser. Open the approved HTTPS link in Safari or Chrome for camera access."
          : "Camera is not available in this browser context. Use the approved HTTPS link in Safari/Chrome."
      );
      setMessage("Use manual token entry or the QR image upload fallback if this browser does not expose camera access.");
      return;
    }

    const videoElement = videoRef.current;
    if (!videoElement) {
      setStatus("error");
      setCameraError("Camera preview is not ready. Please try again or use manual token entry.");
      return;
    }

    setStatus("requesting-permission");
    setCameraError(null);
    setMessage("Requesting camera permission...");
    await waitForPaint();

    let stream: MediaStream | null = null;
    try {
      stopActiveCamera();
      stream = await requestCameraStream(mediaDevices, preferredFacingMode, deviceId);

      if (!mountedRef.current || cameraRequestIdRef.current !== requestId) {
        stopMediaStream(stream);
        return;
      }

      streamRef.current = stream;
      videoElement.muted = true;
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      videoElement.setAttribute("playsinline", "true");
      videoElement.setAttribute("webkit-playsinline", "true");
      videoElement.srcObject = stream;

      try {
        await videoElement.play();
      } catch (playError) {
        stopMediaStream(stream);
        streamRef.current = null;
        clearVideoPreview();
        setStatus("error");
        setCameraError("Camera stream opened, but the video preview could not start. Please retry or use manual token entry.");
        setMessage("Camera preview playback failed.");
        logCameraDiagnostics("video_play_failed", getCameraDiagnostics());
        console.info("[JinaCampus Staff QR camera]", {
          eventName: "video_play_failed",
          errorName: playError instanceof DOMException ? playError.name : "UnknownError"
        });
        return;
      }

      if (!mountedRef.current || cameraRequestIdRef.current !== requestId) {
        stopMediaStream(stream);
        clearVideoPreview();
        return;
      }

      setStatus("camera-active");
      setMessage("Present a staff Attendance QR. Attendance submits automatically when detected.");
      startDecodeLoop();
      void updateCameraControls(stream, mediaDevices, requestId);
    } catch (error) {
      if (cameraRequestIdRef.current !== requestId) {
        stopMediaStream(stream);
        return;
      }

      stopActiveCamera();
      stopMediaStream(stream);
      decodedRef.current = false;
      const safeError = cameraErrorMessage(error);
      setStatus(safeError.status);
      setCameraError(safeError.message);
      setMessage("Use manual token entry if camera scanning is unavailable.");
      console.info("[JinaCampus Staff QR camera]", {
        eventName: "camera_start_failed",
        errorName:
          error instanceof DOMException || error instanceof CameraTimeoutError ? error.name : "UnknownError"
      });
    }
  }

  async function switchCamera() {
    if (disabled || processing || availableCameras.length < 2) return;

    const currentIndex = availableCameras.findIndex((camera) => camera.deviceId === activeCameraDeviceId);
    const nextCamera = availableCameras[(currentIndex + 1 + availableCameras.length) % availableCameras.length];
    if (!nextCamera) return;

    setCameraControlMessage(`Switching to ${nextCamera.label}...`);
    await startCamera(nextCamera.deviceId, true);
  }

  async function toggleTorch() {
    if (disabled || processing || !torchSupported) return;

    const videoTrack = streamRef.current?.getVideoTracks()[0];
    if (!videoTrack) return;

    const nextTorchState = !torchEnabled;
    try {
      await videoTrack.applyConstraints({
        advanced: [{ torch: nextTorchState } as TorchConstraintSet]
      });
      setTorchEnabled(nextTorchState);
      setCameraControlMessage(nextTorchState ? "Flashlight on." : "Flashlight off.");
    } catch {
      setTorchSupported(false);
      setTorchEnabled(false);
      setCameraControlMessage("Flashlight control is not available in this browser.");
    }
  }

  async function decodeUploadedImage(file: File) {
    if (disabled || processing || imageDecodeStatus === "decoding") return;

    setImageDecodeStatus("decoding");
    setImageDecodeMessage("Reading QR image...");
    setCameraError(null);

    const imageUrl = URL.createObjectURL(file);
    try {
      const image = await loadImageFromObjectUrl(imageUrl);
      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;
      const qrPayload = decodeQrFromCanvas(canvas, image, image.naturalWidth, image.naturalHeight);
      if (!qrPayload) {
        setImageDecodeStatus("error");
        setImageDecodeMessage("Could not read a staff attendance QR from this image. Use a fresh QR photo or manual token entry.");
        return;
      }

      setImageDecodeStatus("idle");
      setImageDecodeMessage("QR image decoded. Submitting attendance...");
      decodedRef.current = false;
      submitDetectedPayload(qrPayload);
    } catch {
      setImageDecodeStatus("error");
      setImageDecodeMessage("Could not read a staff attendance QR from this image. Use a fresh QR photo or manual token entry.");
    } finally {
      URL.revokeObjectURL(imageUrl);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  const isCheckingSupport = status === "checking-support";
  const isRequestingPermission = status === "requesting-permission";
  const isCameraActive = status === "camera-active";
  const visibleStatus: ScannerStatus = processing ? "processing" : status;
  const startDisabled = disabled || processing || isCheckingSupport || isRequestingPermission || isCameraActive;
  const startLabel = processing
    ? "Verifying..."
    : isCheckingSupport
    ? "Checking..."
    : isRequestingPermission
      ? "Requesting..."
      : isCameraActive
        ? "Camera Active"
        : "Start Camera";
  const isMobile = variant === "mobile";
  const sectionClassName = isMobile ? "space-y-4" : "premium-card p-4 sm:p-5";

  return (
    <section className={sectionClassName} aria-labelledby="staff-camera-scanner-title">
      <div className="flex flex-col gap-2">
        <div>
          <h2 id="staff-camera-scanner-title" className={isMobile ? "text-base font-semibold text-slate-950" : "text-lg font-semibold text-slate-950"}>
            {title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {description}
          </p>
        </div>
      </div>

      <div
        className={`${isMobile ? "" : "mt-5"} relative mx-auto aspect-square w-full max-w-[36rem] overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-inner`}
        data-qr-scan-frame="true"
      >
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          {...{ "webkit-playsinline": "true" }}
          className="absolute inset-0 h-full w-full object-cover"
          aria-label="Staff QR camera preview"
        />

        <div className="pointer-events-none absolute inset-[11%]" aria-hidden="true">
          <span className="absolute left-0 top-0 h-12 w-12 border-l-4 border-t-4 border-white" />
          <span className="absolute right-0 top-0 h-12 w-12 border-r-4 border-t-4 border-white" />
          <span className="absolute bottom-0 left-0 h-12 w-12 border-b-4 border-l-4 border-white" />
          <span className="absolute bottom-0 right-0 h-12 w-12 border-b-4 border-r-4 border-white" />
          {isCameraActive ? (
            <span className="absolute left-3 right-3 top-1/2 h-0.5 bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,0.9)] motion-safe:animate-pulse" />
          ) : null}
        </div>

        {!isCameraActive ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/72 px-8 text-center text-white">
            <div>
              {processing || isCheckingSupport || isRequestingPermission ? (
                <Loader2 className="mx-auto h-8 w-8 animate-spin" aria-hidden="true" />
              ) : (
                <ScanLine className="mx-auto h-10 w-10 text-cyan-300" aria-hidden="true" />
              )}
              <p className="mt-3 text-sm font-semibold">{statusLabel(visibleStatus)}</p>
              <p className="mt-1 text-xs leading-5 text-slate-300">
                {processing
                  ? "Do not close this page while attendance is verified."
                  : autoStart
                    ? "The camera starts automatically when browser permission allows."
                    : "Camera starts only after you tap the button below."}
              </p>
            </div>
          </div>
        ) : null}

        <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex min-h-8 items-center whitespace-nowrap rounded-full bg-slate-950/80 px-3 text-xs font-semibold text-white backdrop-blur">
            {statusLabel(visibleStatus)}
          </span>
        </div>
      </div>

      {showPrimaryControls ? <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void startCamera()}
          disabled={startDisabled}
          className={`premium-primary-button min-h-12 w-full gap-2 premium-focus ${isMobile ? "text-base" : ""}`}
        >
          {processing || isCheckingSupport || isRequestingPermission ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Camera className="h-4 w-4" aria-hidden="true" />
          )}
          {startLabel}
        </button>
        <button
          type="button"
          onClick={() => stopScanner()}
          disabled={processing || (!isRequestingPermission && !isCameraActive)}
          className={`premium-secondary-button min-h-12 w-full gap-2 premium-focus ${isMobile ? "text-base" : ""}`}
        >
          <Square className="h-4 w-4" aria-hidden="true" />
          Stop
        </button>
      </div> : null}

      {isCameraActive && (availableCameras.length > 1 || torchSupported) ? (
        <div className="flex items-center justify-center gap-2" aria-label="Camera controls">
          {availableCameras.length > 1 ? (
            <button
              type="button"
              onClick={() => void switchCamera()}
              disabled={disabled || processing}
              className="premium-secondary-button min-h-11 gap-2 premium-focus"
              aria-label="Switch camera"
              title="Switch camera"
            >
              <SwitchCamera className="h-4 w-4" aria-hidden="true" />
              Switch
            </button>
          ) : null}
          {torchSupported ? (
            <button
              type="button"
              onClick={() => void toggleTorch()}
              disabled={disabled || processing}
              className="premium-secondary-button min-h-11 gap-2 premium-focus"
              aria-label={torchEnabled ? "Turn flashlight off" : "Turn flashlight on"}
              title={torchEnabled ? "Turn flashlight off" : "Turn flashlight on"}
            >
              {torchEnabled ? (
                <FlashlightOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Flashlight className="h-4 w-4" aria-hidden="true" />
              )}
              Light
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white/88 p-3 text-sm leading-6 text-slate-600">
        <p aria-live="polite">{message}</p>
        {cameraControlMessage ? <p className="mt-1 text-xs text-slate-500">{cameraControlMessage}</p> : null}
        <p className="mt-2 text-xs text-slate-500">Camera scanning requires HTTPS in deployed environments. Localhost works for development.</p>
        <a href="#manual-qr-entry" className="mt-2 inline-flex min-h-11 items-center font-semibold text-brand-700 premium-focus">
          Use manual token entry
        </a>
      </div>

      <details
        className="rounded-lg border border-slate-200 bg-white/80 text-xs leading-5 text-slate-600"
        data-camera-diagnostics="true"
      >
        <summary className="min-h-11 cursor-pointer px-3 py-3 font-semibold text-slate-800 premium-focus">
          Camera diagnostics
        </summary>
        <dl className="grid gap-1 border-t border-slate-200 px-3 py-3 sm:grid-cols-2">
          <div>
            <dt className="font-medium text-slate-700">Secure context</dt>
            <dd>{diagnostics?.isSecureContext ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">navigator.mediaDevices</dt>
            <dd>{diagnostics?.hasMediaDevices ? "Available" : "Missing"}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">getUserMedia</dt>
            <dd>{diagnostics?.hasGetUserMedia ? "Available" : "Missing"}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Likely in-app browser</dt>
            <dd>{diagnostics?.isLikelyInAppBrowser ? "Yes" : "No"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium text-slate-700">Current origin</dt>
            <dd className="break-all">{diagnostics?.origin ?? "Checking in browser..."}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium text-slate-700">Browser user agent</dt>
            <dd className="break-words">{diagnostics?.userAgent ?? "Checking in browser..."}</dd>
          </div>
        </dl>
      </details>

      {cameraError ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          <div className="flex gap-3">
          <VideoOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{cameraError}</p>
          </div>
          <button
            type="button"
            onClick={() => void startCamera()}
            disabled={startDisabled}
            className="premium-secondary-button mt-3 min-h-11 w-full gap-2 premium-focus sm:w-auto"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Retry camera
          </button>
        </div>
      ) : null}

      {diagnostics && !diagnostics.isSecureContext ? (
        <div
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900"
          data-camera-https-warning="true"
        >
          Camera requires a secure HTTPS connection. Please open the approved HTTPS pilot link.
        </div>
      ) : null}

      {diagnostics?.isLikelyInAppBrowser ? (
        <div
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900"
          data-camera-inapp-warning="true"
        >
          This looks like an in-app browser. Open the approved HTTPS link in Safari or Chrome for camera access.
        </div>
      ) : null}

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/90 p-3 text-sm leading-6 text-slate-600">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-slate-900">Upload QR image/photo</p>
            <p className="text-xs text-slate-500">
              Controlled fallback for camera failures. The server still validates branch, QR purpose, expiry, identity, and replay rules.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || processing || imageDecodeStatus === "decoding"}
            className="premium-secondary-button w-full gap-2 sm:w-auto premium-focus"
          >
            <ImageUp className="h-4 w-4" aria-hidden="true" />
            {imageDecodeStatus === "decoding" ? "Reading..." : "Upload QR image"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            disabled={disabled || processing || imageDecodeStatus === "decoding"}
            className="sr-only"
            aria-label="Upload QR image for attendance scan"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void decodeUploadedImage(file);
            }}
          />
        </div>
        {imageDecodeMessage ? <p className="mt-3 text-xs text-slate-600">{imageDecodeMessage}</p> : null}
      </div>
    </section>
  );
}
