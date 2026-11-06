"use client";

import { Eraser, MapPin, PenLine, Type, XCircle } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { declineDocument, signDocument } from "@/app/actions/documents";
import { FormMessage, SubmitButton } from "@/components/form";
import type { Evidence } from "@/lib/evidence";
import { SignatureBoxPicker, type Box } from "../new/signature-box-picker";

const W = 600;
const H = 200;

/**
 * The signer's panel: (1) choose where on the document the signature goes, unless the sender already did,
 * (2) draw or type it, agree, and submit. Decline is tucked underneath.
 */
export function SignPanel({ documentId, signerName, userId, fixedBox }: { documentId: string; signerName: string; userId: string; fixedBox: Box | null }) {
  const [placed, setPlaced] = useState(Boolean(fixedBox));
  const [state, action] = useActionState(signDocument.bind(null, documentId), undefined);
  const [declineState, declineAction] = useActionState(declineDocument.bind(null, documentId), undefined);
  const [mode, setMode] = useState<"drawn" | "typed">("drawn");
  const [typed, setTyped] = useState(signerName);
  const [agree, setAgree] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [drawn, setDrawn] = useState("");
  const [showDecline, setShowDecline] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [locating, setLocating] = useState(false);

  /** Reads what this device can tell us (with the consent ticked below) and asks the browser for the location. */
  async function collectDetails() {
    setLocating(true);
    let deviceId: string | undefined;
    try {
      deviceId = localStorage.getItem("nd_device") ?? undefined;
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem("nd_device", deviceId);
      }
    } catch {}
    let geo: Evidence["geo"] = null;
    let geoStatus: Evidence["geoStatus"] = "unavailable";
    if ("geolocation" in navigator) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }),
        );
        geo = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy };
        geoStatus = "granted";
      } catch (err) {
        const code = (err as GeolocationPositionError).code;
        geoStatus = code === 1 ? "denied" : code === 3 ? "timeout" : "unavailable";
      }
    }
    setEvidence({
      deviceId,
      platform: navigator.platform?.slice(0, 80) || undefined,
      language: navigator.language?.slice(0, 20) || undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: `${screen.width}x${screen.height}`,
      touch: navigator.maxTouchPoints > 0,
      geoStatus,
      geo,
    });
    setLocating(false);
  }

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a2e";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.01, p.y + 0.01); // a tap leaves a dot
    ctx.stroke();
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    setHasInk(true);
    setDrawn(trimmed(e.currentTarget));
  };

  /** The drawing cropped to the pen strokes (plus a small margin), so the signature fills its box on the document. */
  function trimmed(c: HTMLCanvasElement) {
    const ctx = c.getContext("2d");
    if (!ctx) return c.toDataURL("image/png");
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return c.toDataURL("image/png");
    const pad = 6;
    const sx = Math.max(0, minX - pad);
    const sy = Math.max(0, minY - pad);
    const sw = Math.min(width, maxX + pad + 1) - sx;
    const sh = Math.min(height, maxY + pad + 1) - sy;
    const out = document.createElement("canvas");
    out.width = sw;
    out.height = sh;
    out.getContext("2d")?.drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh);
    return out.toDataURL("image/png");
  }

  const clear = () => {
    const c = canvas.current;
    c?.getContext("2d")?.clearRect(0, 0, W, H);
    setHasInk(false);
    setDrawn("");
  };

  // Location is compulsory: the button stays off until the device has shared it.
  const ready = placed && agree && !locating && Boolean(evidence?.geo) && (mode === "drawn" ? hasInk : typed.trim().length >= 2);

  return (
    <section className="card p-5 sm:p-6">
      <h2 className="font-semibold">Sign this document</h2>
      <p className="mt-1 text-sm text-muted">Read the document above. Then mark where your signature goes, and sign.</p>
      <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-sm text-warning">
        <MapPin className="mt-px size-4 shrink-0" />
        Your location is required to sign. When you tick the box below, your browser asks for it: choose Allow.
      </p>

      <form action={action} className="mt-5 space-y-5">
        <FormMessage error={state?.error} />
        <input type="hidden" name="kind" value={mode} />
        <input type="hidden" name="drawn" value={mode === "drawn" ? drawn : ""} />
        <input type="hidden" name="evidence" value={JSON.stringify(evidence ?? { geoStatus: "skipped", geo: null })} />

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">1. {fixedBox ? "Where your signature goes" : "Choose where your signature goes"}</h3>
          <SignatureBoxPicker
            url={`/api/documents/${documentId}/file`}
            signers={[{ id: userId, name: signerName }]}
            optional={false}
            fixedBox={fixedBox}
            onChange={(boxes) => setPlaced(Boolean(boxes[userId]))}
            preview={mode === "drawn" ? (drawn ? { kind: "drawn", src: drawn } : null) : typed.trim() ? { kind: "typed", text: typed.trim() } : null}
          />
        </div>

        <h3 className="text-sm font-semibold">2. Your signature</h3>

        <div role="tablist" aria-label="Signature type" className="inline-flex rounded-xl bg-surface-2 p-1 text-sm font-medium">
          {([
            ["drawn", "Draw", PenLine],
            ["typed", "Type", Type],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 transition-colors ${
                mode === value ? "bg-surface text-text shadow-card" : "text-muted hover:text-text"
              }`}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        {mode === "drawn" ? (
          <div>
            <div className="relative overflow-hidden rounded-xl border border-border bg-white">
              <canvas
                ref={canvas}
                width={W}
                height={H}
                className="block h-auto w-full cursor-crosshair touch-none"
                onPointerDown={start}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                aria-label="Signature drawing area"
              />
              {!hasInk && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-faint">
                  Sign here with your mouse, finger or stylus
                </span>
              )}
              <span aria-hidden className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-dashed border-border" />
            </div>
            <button type="button" onClick={clear} className="btn-ghost btn-sm mt-2">
              <Eraser className="size-3.5" /> Clear
            </button>
          </div>
        ) : (
          <div>
            <input
              name="typed"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              maxLength={60}
              autoComplete="name"
              aria-label="Your full name"
              className="input h-14 font-serif text-2xl italic"
              placeholder="Type your full name"
            />
            <p className="field-hint">Your typed name will be used as your signature.</p>
          </div>
        )}

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="agree"
            checked={agree}
            onChange={(e) => {
              setAgree(e.target.checked);
              if (e.target.checked && !evidence) void collectDetails();
            }}
            className="mt-0.5 size-4 shrink-0 accent-(--primary)"
          />
          <span>
            I have read this document and agree to sign it electronically. I agree that the time, my IP address, my device details and my location (with the street address it points to) are
            recorded and shared with the sender as proof of signing.
          </span>
        </label>

        {agree && (
          <p className="-mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <MapPin className="size-4 shrink-0 text-faint" />
            {locating ? (
              "Getting your location… allow it when your browser asks."
            ) : evidence?.geo ? (
              `Location captured (accurate to about ${Math.round(evidence.geo.accuracy)} m).`
            ) : (
              <>
                <span className="font-medium text-danger">
                  {evidence?.geoStatus === "denied"
                    ? "Location is required to sign, and your browser blocked it. Allow location for this site (the icon next to the address bar), then"
                    : "Location is required to sign and couldn't be read. Turn on location (GPS) on this device, then"}
                </span>{" "}
                <button type="button" onClick={() => void collectDetails()} className="font-semibold text-primary hover:underline">
                  Try again
                </button>
              </>
            )}
          </p>
        )}

        {!placed && <p className="text-sm font-medium text-danger">Click on the document (step 1) to choose where your signature goes.</p>}
        <SubmitButton pendingText="Signing…" disabled={!ready}>
          Sign and submit
        </SubmitButton>
      </form>

      <div className="mt-6 border-t border-border pt-5">
        {!showDecline ? (
          <button type="button" onClick={() => setShowDecline(true)} className="text-sm font-medium text-muted hover:text-danger">
            I can&apos;t sign this document…
          </button>
        ) : (
          <form action={declineAction} className="space-y-3">
            <FormMessage error={declineState?.error} />
            <label htmlFor="reason" className="field-label">
              Why can&apos;t you sign it? (optional)
            </label>
            <textarea id="reason" name="reason" maxLength={500} className="input" placeholder="The sender will see this message." />
            <div className="flex flex-wrap gap-2">
              <SubmitButton className="btn-danger btn-sm" pendingText="Declining…">
                <XCircle className="size-3.5" /> Decline document
              </SubmitButton>
              <button type="button" onClick={() => setShowDecline(false)} className="btn-ghost btn-sm">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
