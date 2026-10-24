import { useCallback, useEffect, useRef, useState } from "react";

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};

function getBarcodeDetector(): BarcodeDetectorLike | null {
  const ctor = (window as unknown as {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }).BarcodeDetector;
  if (!ctor) return null;
  try {
    return new ctor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

async function loadJsQr(): Promise<
  | ((data: Uint8ClampedArray, width: number, height: number) => { data: string } | null)
  | null
> {
  try {
    const specifier = "https://esm.sh/jsqr@1.4.0";
    const module = await import(/* @vite-ignore */ specifier);
    const decoder = (module as { default?: unknown }).default ?? module;
    return typeof decoder === "function"
      ? (decoder as (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null)
      : null;
  } catch {
    return null;
  }
}

async function readFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<string | null> {
  if (video.readyState < 2) return null;
  const detector = getBarcodeDetector();
  if (detector) {
    try {
      const found = await detector.detect(video);
      return found[0]?.rawValue ?? null;
    } catch {
      /* fall through to the JS decoder */
    }
  }
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(video, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const decode = await loadJsQr();
  if (!decode) return null;
  try {
    const result = decode(pixels.data, width, height);
    return result?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Camera scanner for the till. Prefers the built-in BarcodeDetector and falls
 * back to jsQR. Every path ends with the scanned value going through the same
 * lookup as typing the code.
 */
export function CardScanner({
  onCode,
  onClose,
}: {
  onCode: (code: string) => void;
  onClose?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting");
  const [message, setMessage] = useState("");

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setMessage("This browser cannot open a camera. Type the member code instead.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setStatus("scanning");
        const canvas = canvasRef.current;
        timer = window.setInterval(async () => {
          if (!canvas || !videoRef.current) return;
          const value = await readFrame(videoRef.current, canvas);
          if (value && alive) {
            stop();
            onCode(value.trim().toUpperCase());
          }
        }, 350);
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        setStatus("error");
        setMessage(
          name === "NotAllowedError"
            ? "Camera permission was blocked. Allow the camera or type the member code."
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "No camera found. Type the member code instead."
              : "Could not start the camera. Type the member code instead.",
        );
      }
    };
    void start();
    return () => {
      alive = false;
      if (timer) window.clearInterval(timer);
      stop();
    };
  }, [onCode, stop]);

  return (
    <div className="scanner" role="dialog" aria-label="Scan a guest card">
      <div className="scanner-frame">
        <video ref={videoRef} muted playsInline aria-label="Camera preview" />
        <canvas ref={canvasRef} hidden />
        {status === "scanning" && <span className="scanner-guide" aria-hidden />}
      </div>
      {status === "error" ? (
        <p role="alert" className="scanner-message">
          {message}
        </p>
      ) : (
        <p className="scanner-message" role="status">
          Point the camera at the code on the guest&apos;s card.
        </p>
      )}
      <button
        type="button"
        className="builder-secondary"
        onClick={() => {
          stop();
          onClose?.();
        }}
      >
        Cancel scan
      </button>
    </div>
  );
}
