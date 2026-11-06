"use client";

import { Loader2, MousePointerClick, Move } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

export type Box = { page: number; x: number; y: number; w: number; h: number };

const A4_RATIO = 595.28 / 841.89;
const SIZES = [
  { label: "Small", w: 0.24 },
  { label: "Medium", w: 0.34 },
  { label: "Large", w: 0.46 },
];
/** Height of the box as a fraction of the page, for a box about 3.2 times as wide as it is tall. */
const heightFor = (w: number, ratio: number) => (w * ratio) / 3.2;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

type Person = { id: string; name: string };

/** What to show inside the signer's box: their drawn or typed signature, so they see exactly what they're placing. */
export type SignaturePreview = { kind: "drawn"; src: string } | { kind: "typed"; text: string } | null;

/**
 * Shows the PDF's pages and lets someone click where a signature should go. The result is a hidden
 * "signatureBoxes" field: {"<userId>": {page, x, y, w, h}} with positions as fractions of the page.
 *
 * Sender mode (a local `file`, several `signers`, optional): marks each person's spot; anyone without one signs on
 * the certificate pages only. Signer mode (`url` of the stored PDF, one signer, `optional={false}`): the signer must
 * click where their own signature goes. With `fixedBox`, the sender already chose the spot and it is only shown.
 */
export function SignatureBoxPicker({
  file = null,
  url,
  blank = false,
  signers,
  optional = true,
  fixedBox,
  onChange,
  preview = null,
}: {
  file?: File | null;
  url?: string;
  blank?: boolean;
  signers: Person[];
  optional?: boolean;
  fixedBox?: Box | null;
  onChange?: (boxes: Record<string, Box>) => void;
  preview?: SignaturePreview;
}) {
  const source: File | string | null = url ?? file;
  const [placeChosen, setPlace] = useState(true);
  const place = optional ? placeChosen : true;
  const [loaded, setLoaded] = useState<{ source: File | string; pdf: PDFDocumentProxy } | null>(null);
  const [failed, setFailed] = useState<File | string | null>(null);
  const [chosenPage, setChosenPage] = useState<number | null>(null);
  const [rendered, setRendered] = useState<{ key: string; ratio: number; rotate: number } | null>(null);
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const [chosenActive, setActive] = useState<string | null>(null);
  // Whose box a click places: the one picked, else the first signer without a box yet.
  const active = signers.find((s) => s.id === chosenActive)?.id ?? (signers.find((s) => !boxes[s.id]) ?? signers[0])?.id ?? null;
  const box = active ? (boxes[active] ?? null) : null;
  const setBox = (b: Box) => {
    if (!active || fixedBox) return;
    const next = { ...boxes, [active]: b };
    setBoxes(next);
    onChange?.(next);
  };
  const [size, setSize] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const pdf = !blank && source && loaded?.source === source ? loaded.pdf : null;
  const pageCount = blank ? 1 : (pdf?.numPages ?? 0);
  const page = clamp(chosenPage ?? fixedBox?.page ?? pageCount - 1, 0, Math.max(0, pageCount - 1));
  const renderKey = pdf ? `${pdf.fingerprints[0]}:${page}` : "";
  const info = blank ? { ratio: A4_RATIO, rotate: 0 } : rendered?.key === renderKey ? rendered : null;
  const loading = !blank && !!source && !pdf && failed !== source;

  // Load the PDF in the browser: the sender's chosen file (nothing is uploaded until the form is sent), or the
  // stored document for a signer (same site, so their sign-in cookie comes along).
  useEffect(() => {
    if (blank || !source) return;
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        task = pdfjs.getDocument({
          ...(typeof source === "string" ? { url: source } : { data: new Uint8Array(await source.arrayBuffer()) }),
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
        });
        const doc = await task.promise;
        if (cancelled) return;
        setLoaded({ source, pdf: doc });
        setChosenPage(null);
        setBoxes({});
      } catch {
        if (!cancelled) setFailed(source);
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [source, blank]);

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

  if (!blank && !source) return null;
  const kept = Object.fromEntries(Object.entries(fixedBox && signers[0] ? { [signers[0].id]: fixedBox } : boxes).filter(([id, b]) => b.page < pageCount && signers.some((s) => s.id === id)));
  const value = place && Object.keys(kept).length ? JSON.stringify(kept) : "";
  const nameOf = (id: string) => signers.find((s) => s.id === id)?.name ?? "";

  return (
    <div className="space-y-3">
      <input type="hidden" name="signatureBoxes" value={value} />
      {optional && (
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={place} onChange={(e) => setPlace(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-(--primary)" />
          <span>
            <span className="block font-medium">Put the signatures on the document</span>
            <span className="block text-xs text-faint">
              Mark each person&apos;s spot, for example their &quot;Signature&quot; line. Anyone you don&apos;t mark chooses their own spot when they sign. A signature
              certificate page per person is always added at the end too.
            </span>
          </span>
        </label>
      )}

      {place && (
        <div className="space-y-3 rounded-xl border border-border bg-surface-2/60 p-3 sm:p-4">
          {loading && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" /> Opening the PDF…
            </p>
          )}
          {!blank && failed === source && <p className="text-sm text-danger">This PDF can&apos;t be previewed, so the signature will go on the certificate page only.</p>}

          {pageCount > 0 && signers.length === 0 && <p className="text-sm text-muted">Choose at least one signer to mark where their signature goes.</p>}
          {pageCount > 0 && signers.length > 0 && (
            <>
              {signers.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 text-sm" role="group" aria-label="Whose signature are you placing?">
                  <span className="mr-1 text-xs font-medium text-faint">Placing for:</span>
                  {signers.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setActive(s.id);
                        if (boxes[s.id]) setChosenPage(boxes[s.id].page);
                      }}
                      aria-pressed={active === s.id}
                      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                        active === s.id ? "bg-accent text-accent-text ring-accent" : "bg-surface text-muted ring-border hover:text-text"
                      }`}
                    >
                      {s.name} {boxes[s.id] ? "✓" : ""}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {pageCount > 1 && !fixedBox && (
                  <select
                    aria-label="Page"
                    value={page}
                    onChange={(e) => setChosenPage(Number(e.target.value))}
                    className="input h-11 w-auto py-0 pr-8 text-sm"
                  >
                    {Array.from({ length: pageCount }, (_, i) => (
                      <option key={i} value={i} className="bg-surface text-text">
                        Page {i + 1} of {pageCount}
                      </option>
                    ))}
                  </select>
                )}
                {!fixedBox && (<>
                <span className="inline-flex rounded-lg bg-surface p-0.5 ring-1 ring-border" role="group" aria-label="Signature size">
                  {SIZES.map((s, i) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => resize(i)}
                      aria-pressed={size === i}
                      className={`min-h-10 rounded-md px-2.5 py-2 text-xs font-medium ${size === i ? "bg-primary text-primary-text" : "text-muted hover:text-text"}`}
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
                </>)}
              </div>

              <div ref={wrapRef} className="relative mx-auto w-full max-w-[560px] overflow-hidden rounded-lg bg-white shadow-card ring-1 ring-border">
                {blank ? (
                  <div className="w-full" style={{ aspectRatio: String(A4_RATIO) }} />
                ) : (
                  <canvas ref={canvasRef} className="block h-auto w-full" aria-label={`Preview of page ${page + 1}`} />
                )}
                {info && !rotated && (
                  <div
                    className={`absolute inset-0 touch-none ${fixedBox ? "" : "cursor-crosshair"}`}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      dragging.current = true;
                      setActive(active); // keep placing this person's box for the whole drag
                      fromPointer(e);
                    }}
                    onPointerMove={(e) => dragging.current && fromPointer(e)}
                    onPointerUp={() => {
                      if (!dragging.current) return;
                      dragging.current = false;
                      // Move on to the next person who has no spot yet, so three clicks place three signatures.
                      const next = signers.find((s) => s.id !== active && !boxes[s.id]);
                      if (next) setActive(next.id);
                    }}
                    onPointerCancel={() => (dragging.current = false)}
                  >
                    {!optional && !fixedBox && !box && (
                      <div className="pointer-events-none absolute inset-x-4 top-1/2 flex -translate-y-1/2 items-center justify-center">
                        <span className="flex items-center gap-2 rounded-xl bg-accent px-3 py-2 text-center text-xs font-semibold text-accent-text shadow-pop sm:text-sm">
                          <MousePointerClick className="size-4" /> Click where your signature goes
                        </span>
                      </div>
                    )}
                    {Object.entries(kept)
                      .filter(([, b]) => b.page === page)
                      .map(([id, b]) => (
                        <div
                          key={id}
                          className={`pointer-events-none absolute flex items-center justify-center overflow-hidden rounded border-2 border-dashed px-1 text-center text-[11px] leading-tight font-semibold ${
                            id === active ? "border-accent bg-accent/15 text-accent" : "border-primary/60 bg-primary/10 text-primary"
                          }`}
                          style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
                        >
                          {!optional && preview?.kind === "drawn" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={preview.src} alt="Your signature" className="size-full object-contain" />
                          ) : !optional && preview?.kind === "typed" ? (
                            <span className="truncate font-serif text-[15px] font-normal text-[#141a52] italic">{preview.text}</span>
                          ) : (
                            <span className="flex items-center gap-1">
                              {!optional && !fixedBox && <Move className="size-3" />}
                              {signers.length > 1 ? nameOf(id) : optional ? "Sign here" : "Your signature"}
                            </span>
                          )}
                        </div>
                      ))}
                  </div>
                )}
                {loading && <div className="absolute inset-0 animate-pulse bg-surface-2" />}
              </div>

              <p className="flex items-start gap-1.5 text-xs text-muted">
                <MousePointerClick className="mt-px size-3.5 shrink-0" />
                {fixedBox
                  ? `The sender marked where your signature goes: the box on page ${fixedBox.page + 1}.`
                  : rotated
                  ? "This page is turned sideways, which isn't supported for placing a signature. Choose another page, or the signature goes on the certificate page only."
                  : !optional
                  ? box
                    ? `Your signature goes in the box on page ${box.page + 1}. Click or drag to move it.`
                    : "Click on the document where your signature should go, for example on the line above your name."
                  : box
                    ? `${signers.length > 1 ? `${nameOf(active!)}'s signature` : "Signature"} goes on page ${box.page + 1}.${box.page !== page ? " (Switch to that page to move it.)" : " Click or drag to move it."}`
                    : `Click on the page where ${signers.length > 1 ? `${nameOf(active!)}'s` : "the"} signature should go.`}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
