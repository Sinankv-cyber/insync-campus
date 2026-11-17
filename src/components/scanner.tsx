"use client";
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff, Keyboard } from "lucide-react";
import { Button } from "./ui";

type ScanState = "idle" | "starting" | "scanning" | "denied" | "unavailable" | "insecure" | "unreadable";

/**
 * Camera QR scanner (jsQR on canvas frames). Every failure state points to typed-code entry.
 * Camera needs a secure context (HTTPS or localhost).
 */
export function Scanner({ onResult, onUseCode, autoStart = false }: { onResult: (text: string) => void; onUseCode: () => void; autoStart?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [state, setState] = useState<ScanState>("idle");
  const doneRef = useRef(false);

  function stop() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function start() {
    doneRef.current = false;
    if (!window.isSecureContext) { setState("insecure"); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setState("unavailable"); return; }
    setState("starting");
    try {
      // Some browsers never settle getUserMedia when no camera exists — give up after 10 s.
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false }),
        new Promise<never>((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { name: "TimeoutError" })), 10_000)),
      ]);
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      setState("scanning");
      const started = Date.now();
      const loop = () => {
        if (doneRef.current) return;
        const c = canvasRef.current!;
        if (v.readyState >= 2 && v.videoWidth) {
          const w = Math.min(640, v.videoWidth), h = Math.round((w / v.videoWidth) * v.videoHeight);
          c.width = w; c.height = h;
          const ctx = c.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(v, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
          if (code?.data) {
            doneRef.current = true;
            navigator.vibrate?.(60);
            stop();
            setState("idle");
            onResult(code.data);
            return;
          }
        }
        if (Date.now() - started > 25000) { stop(); setState("unreadable"); return; }
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch (e) {
      const name = (e as Error).name;
      setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
      stop();
    }
  }

  useEffect(() => {
    if (autoStart) start(); // eslint-disable-line react-hooks/set-state-in-effect
    return stop;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const msg: Partial<Record<ScanState, [string, string]>> = {
    denied: ["Camera permission denied", "Allow camera access in your browser settings, or enter the code instead."],
    unavailable: ["Camera unavailable", "No usable camera was found. Enter the code instead."],
    insecure: ["Camera needs HTTPS", "Scanning only works on a secure (https://) address. Enter the code instead."],
    unreadable: ["Couldn't read a QR code", "Move closer, avoid glare, or enter the code instead."],
  };
  const problem = msg[state];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-navy-950 ring-1 ring-navy-800 sm:aspect-[4/3]">
        <video ref={videoRef} playsInline muted className={state === "scanning" ? "h-full w-full object-cover" : "hidden"} />
        <canvas ref={canvasRef} className="hidden" />
        {state === "scanning" && (
          <div className="pointer-events-none absolute inset-[12%] rounded-2xl border-2 border-teal-500/90">
            <span className="scanline absolute inset-x-2 h-0.5 rounded bg-teal-500 shadow-[0_0_12px_2px] shadow-teal-500/60" />
          </div>
        )}
        {state !== "scanning" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
            {problem ? <CameraOff className="size-10 text-amber-100" aria-hidden /> : <Camera className="size-10 text-teal-500" aria-hidden />}
            {problem ? (
              <div role="alert"><p className="font-semibold">{problem[0]}</p><p className="mt-1 text-sm text-white/70">{problem[1]}</p></div>
            ) : (
              <p className="text-sm text-white/80">{state === "starting" ? "Starting camera…" : "Point the camera at the QR code"}</p>
            )}
            {state !== "starting" && <Button onClick={start} variant="secondary">{problem ? "Try camera again" : "Start camera"}</Button>}
          </div>
        )}
      </div>
      <Button variant={problem ? "primary" : "secondary"} size="lg" onClick={() => { stop(); setState("idle"); onUseCode(); }}>
        <Keyboard className="size-5" aria-hidden /> Enter code instead
      </Button>
    </div>
  );
}

export function CodeInput({ value, onChange, id = "code", autoFocus }: { value: string; onChange: (v: string) => void; id?: string; autoFocus?: boolean }) {
  return (
    <input
      id={id}
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => {
        const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
        onChange(raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw);
      }}
      inputMode="text"
      autoCapitalize="characters"
      autoComplete="one-time-code"
      spellCheck={false}
      placeholder="K7QM-4XPR"
      aria-describedby={`${id}-hint`}
      className="code-chars min-h-16 w-full rounded-2xl border-0 bg-white px-4 text-center text-3xl font-bold text-navy-900 ring-2 ring-sand-300 placeholder:text-sand-300 focus:outline-none focus:ring-teal-500"
    />
  );
}
