"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, RefreshCw, ScanFace, UserX } from "lucide-react";
import { Banner, Button } from "./ui";

export type FaceResult = { faceCheck: "face_detected" | "no_face" | "not_checked"; faceImage?: string };

const MP_VERSION = "1.2.3";
type Detector = { detect: (c: HTMLCanvasElement) => Promise<number> };
let detectorPromise: Promise<Detector | null> | null = null;

/** Face PRESENCE check only (is a human face in frame?). Not identity verification. */
async function getDetector(): Promise<Detector | null> {
  if (detectorPromise) return detectorPromise;
  detectorPromise = (async () => {
    const W = window as unknown as { FaceDetector?: new (o: object) => { detect: (s: CanvasImageSource) => Promise<unknown[]> } };
    if (W.FaceDetector) {
      try {
        const fd = new W.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
        return { detect: async (c) => (await fd.detect(c)).length };
      } catch { /* fall through */ }
    }
    try {
      const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const files = await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`);
      const fd = await FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite", delegate: "CPU" },
        runningMode: "IMAGE", minDetectionConfidence: 0.6,
      });
      return { detect: async (c) => fd.detect(c).detections.length };
    } catch {
      return null;
    }
  })();
  return detectorPromise;
}

export function FaceCheck({ onDone }: { onDone: (r: FaceResult) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"idle" | "camera" | "checking" | "done" | "error">("idle");
  const [result, setResult] = useState<FaceResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const stop = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  useEffect(() => stop, []);

  async function openCamera() {
    setErr(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setErr("Camera needs a secure (https) connection on this device."); setState("error"); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 } }, audio: false });
      streamRef.current = s;
      setState("camera");
      requestAnimationFrame(async () => { if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play().catch(() => {}); } });
      getDetector(); // warm up in background
    } catch (e) {
      setErr((e as Error).name === "NotAllowedError" ? "Camera permission was denied." : "Front camera is not available.");
      setState("error");
    }
  }

  async function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setState("checking");
    const big = document.createElement("canvas");
    big.width = 480; big.height = Math.round((480 / v.videoWidth) * v.videoHeight);
    big.getContext("2d")!.drawImage(v, 0, 0, big.width, big.height);
    const small = document.createElement("canvas");
    small.width = 200; small.height = Math.round((200 / big.width) * big.height);
    small.getContext("2d")!.drawImage(big, 0, 0, small.width, small.height);
    const jpeg = small.toDataURL("image/jpeg", 0.7);
    stop();
    setPreview(jpeg);
    const det = await getDetector();
    let r: FaceResult;
    if (!det) r = { faceCheck: "not_checked", faceImage: jpeg };
    else {
      const n = await det.detect(big).catch(() => -1);
      r = n < 0 ? { faceCheck: "not_checked", faceImage: jpeg } : { faceCheck: n > 0 ? "face_detected" : "no_face", faceImage: jpeg };
    }
    setResult(r);
    setState("done");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-700"><ScanFace className="size-5" aria-hidden /></span>
        <div>
          <p className="font-semibold">Quick face check</p>
          <p className="text-sm text-navy-500">Checks that a face is in the photo — it does not identify you. Your teacher still confirms you in class. The photo is deleted when the session is finalized.</p>
          <p className="ml mt-1 text-sm text-navy-500">മുഖം ക്യാമറയിൽ കാണിക്കുക. ടീച്ചർ സ്ഥിരീകരിക്കും.</p>
        </div>
      </div>

      {state === "camera" && (
        <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-3xl bg-navy-950">
          <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
          <div className="pointer-events-none absolute inset-x-[18%] inset-y-[14%] rounded-[50%] border-2 border-dashed border-white/70" />
        </div>
      )}
      {(state === "checking" || state === "done") && preview && (
        <div className="flex items-center gap-3 rounded-2xl bg-sand-100 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Your face check photo" className="size-16 rounded-xl object-cover -scale-x-100" />
          <div className="text-sm">
            {state === "checking" && <p className="font-semibold">Checking photo… (first time may take a few seconds)</p>}
            {result?.faceCheck === "face_detected" && <p className="flex items-center gap-1.5 font-semibold text-leaf-700"><CheckCircle2 className="size-4" aria-hidden />Face detected</p>}
            {result?.faceCheck === "no_face" && <p className="flex items-center gap-1.5 font-semibold text-amber-700"><UserX className="size-4" aria-hidden />No face found — teacher will review</p>}
            {result?.faceCheck === "not_checked" && <p className="font-semibold text-navy-700">Photo attached — automatic check unavailable; teacher will review</p>}
          </div>
        </div>
      )}
      {err && <Banner tone="amber" title="Face check unavailable">{err} You can continue — your teacher will review your request.</Banner>}

      <div className="grid gap-2 sm:grid-cols-2">
        {state === "idle" && <Button onClick={openCamera}><Camera className="size-4" aria-hidden />Open front camera</Button>}
        {state === "camera" && <Button onClick={capture}><Camera className="size-4" aria-hidden />Take photo</Button>}
        {state === "done" && <Button onClick={() => onDone(result!)}><CheckCircle2 className="size-4" aria-hidden />Use this photo</Button>}
        {state === "done" && <Button variant="secondary" onClick={() => { setResult(null); setPreview(null); openCamera(); }}><RefreshCw className="size-4" aria-hidden />Retake</Button>}
        {state !== "done" && state !== "checking" && <Button variant="secondary" onClick={() => { stop(); onDone({ faceCheck: "not_checked" }); }}>Skip — teacher will review</Button>}
      </div>
    </div>
  );
}
