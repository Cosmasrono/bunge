"use client";

import { Loader2, MousePointerClick } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

type Box = { page: number; x: number; y: number; w: number; h: number };

const A4_RATIO = 595.28 / 841.89;
const SIZES = [
  { label: "Small", w: 0.24 },
  { label: "Medium", w: 0.34 },
  { label: "Large", w: 0.46 },
];
/** Height of the box as a fraction of the page, for a box about 3.2 times as wide as it is tall. */
const heightFor = (w: number, ratio: number) => (w * ratio) / 3.2;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Shows the PDF's pages and lets the sender click where the signature should go. The result is a hidden
 * "signatureBox" field: page number plus position as fractions of the page. Empty = certificate page only.
 */
export function SignatureBoxPicker({ file, blank }: { file: File | null; blank: boolean }) {
  const [place, setPlace] = useState(true);
  const [loaded, setLoaded] = useState<{ source: File; pdf: PDFDocumentProxy } | null>(null);
  const [failed, setFailed] = useState<File | null>(null);
  const [chosenPage, setChosenPage] = useState<number | null>(null);
  const [rendered, setRendered] = useState<{ key: string; ratio: number; rotate: number } | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [size, setSize] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const pdf = !blank && file && loaded?.source === file ? loaded.pdf : null;
  const pageCount = blank ? 1 : (pdf?.numPages ?? 0);
  const page = clamp(chosenPage ?? pageCount - 1, 0, Math.max(0, pageCount - 1));
  const renderKey = pdf ? `${pdf.fingerprints[0]}:${page}` : "";
  const info = blank ? { ratio: A4_RATIO, rotate: 0 } : rendered?.key === renderKey ? rendered : null;
  const loading = !blank && !!file && !pdf && failed !== file;

  // Load the chosen PDF in the browser (nothing is uploaded until the form is sent).
  useEffect(() => {
    if (blank || !file) return;
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        task = pdfjs.getDocument({
          data: new Uint8Array(await file.arrayBuffer()),
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
        });
        const doc = await task.promise;
        if (cancelled) return;
        setLoaded({ source: file, pdf: doc });
        setChosenPage(null);
        setBox(null);
      } catch {
        if (!cancelled) setFailed(file);
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [file, blank]);

  // Draw the current page.
  useEffect(() => {
    if (!pdf || !canvasRef.current || !wrapRef.current) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    void (async () => {
      const p = await pdf.getPage(page + 1);
      const natural = p.getViewport({ scale: 1 });
      const scale = Math.min(3, ((wrapRef.current?.clientWidth || 600) * Math.min(2, window.devicePixelRatio || 1)) / natural.width);
      const viewport = p.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = p.render({ canvas, viewport });
      try {
        await task.promise;
        if (!cancelled) setRendered({ key: `${pdf.fingerprints[0]}:${page}`, ratio: natural.width / natural.height, rotate: p.rotate % 360 });
      } catch {
        /* a newer render replaced this one */
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page]);

  const rotated = !!info && info.rotate !== 0;

  function placeAt(u: number, v: number) {
    if (!info || rotated) return;
    const w = SIZES[size].w;
    const h = heightFor(w, info.ratio);
    setBox({ page, x: clamp(u - w / 2, 0, 1 - w), y: clamp(v - h / 2, 0, 1 - h), w, h });
  }
  function fromPointer(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    placeAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }
  function resize(i: number) {
    setSize(i);
    if (box && info && box.page === page) {
      const w = SIZES[i].w;
      const h = heightFor(w, info.ratio);
      setBox({ ...box, w, h, x: clamp(box.x, 0, 1 - w), y: clamp(box.y, 0, 1 - h) });
    }
  }

  if (!blank && !file) return null;
  const value = place && box && box.page < pageCount ? JSON.stringify(box) : "";

  return (
    <div className="space-y-3">
      <input type="hidden" name="signatureBox" value={value} />
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={place} onChange={(e) => setPlace(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-(--primary)" />
        <span>
          <span className="block font-medium">Put the signature on the document</span>
          <span className="block text-xs text-faint">Mark the spot, for example the &quot;Signature&quot; line. A signature certificate page is always added at the end too.</span>
        </span>
      </label>

      {place && (
        <div className="space-y-3 rounded-xl border border-border bg-surface-2/60 p-3 sm:p-4">
          {loading && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" /> Opening the PDF…
            </p>
          )}
          {!blank && failed === file && <p className="text-sm text-danger">This PDF can&apos;t be previewed, so the signature will go on the certificate page only.</p>}

          {pageCount > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {pageCount > 1 && (
                  <select
                    aria-label="Page"
                    value={page}
                    onChange={(e) => setChosenPage(Number(e.target.value))}
                    className="input h-9 w-auto py-0 pr-8 text-sm"
                  >
                    {Array.from({ length: pageCount }, (_, i) => (
                      <option key={i} value={i} className="bg-surface text-text">
                        Page {i + 1} of {pageCount}
                      </option>
                    ))}
                  </select>
                )}
                <span className="inline-flex rounded-lg bg-surface p-0.5 ring-1 ring-border" role="group" aria-label="Signature size">
                  {SIZES.map((s, i) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => resize(i)}
                      aria-pressed={size === i}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ${size === i ? "bg-primary text-primary-text" : "text-muted hover:text-text"}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </span>
                {[
                  ["Bottom left", 0.06],
                  ["Bottom right", 0.94],
                ].map(([label, u]) => (
                  <button key={label as string} type="button" onClick={() => placeAt(u as number, 0.85)} className="btn-ghost btn-sm" disabled={!info || rotated}>
                    {label as string}
                  </button>
                ))}
              </div>

              <div ref={wrapRef} className="relative mx-auto w-full max-w-[560px] overflow-hidden rounded-lg bg-white shadow-card ring-1 ring-border">
                {blank ? (
                  <div className="w-full" style={{ aspectRatio: String(A4_RATIO) }} />
                ) : (
                  <canvas ref={canvasRef} className="block h-auto w-full" aria-label={`Preview of page ${page + 1}`} />
                )}
                {info && !rotated && (
                  <div
                    className="absolute inset-0 cursor-crosshair touch-none"
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      dragging.current = true;
                      fromPointer(e);
                    }}
                    onPointerMove={(e) => dragging.current && fromPointer(e)}
                    onPointerUp={() => (dragging.current = false)}
                    onPointerCancel={() => (dragging.current = false)}
                  >
                    {box && box.page === page && (
                      <div
                        className="pointer-events-none absolute flex items-center justify-center rounded border-2 border-dashed border-accent bg-accent/10 text-xs font-semibold text-accent"
                        style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
                      >
                        Sign here
                      </div>
                    )}
                  </div>
                )}
                {loading && <div className="absolute inset-0 animate-pulse bg-surface-2" />}
              </div>

              <p className="flex items-start gap-1.5 text-xs text-muted">
                <MousePointerClick className="mt-px size-3.5 shrink-0" />
                {rotated
                  ? "This page is turned sideways, which isn't supported for placing a signature. Choose another page, or the signature goes on the certificate page only."
                  : box
                    ? `Signature goes on page ${box.page + 1}.${box.page !== page ? " (Switch to that page to move it.)" : " Click or drag to move it."}`
                    : "Click on the page where the signature should go."}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
