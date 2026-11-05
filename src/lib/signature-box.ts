import { z } from "zod";

/**
 * Where on the document the signature goes: a page (0-based) and a rectangle measured as fractions of that page
 * as it is displayed (0,0 = top-left corner, 1,1 = bottom-right). Fractions keep it independent of zoom and page size.
 */
export const signatureBoxSchema = z
  .object({
    page: z.number().int().min(0).max(999),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0.03).max(1),
    h: z.number().min(0.015).max(1),
  })
  .refine((b) => b.x + b.w <= 1.0001 && b.y + b.h <= 1.0001, "The signature box must be inside the page.");

export type SignatureBox = z.infer<typeof signatureBoxSchema>;

export function parseSignatureBox(raw: unknown): SignatureBox | null {
  let value = raw;
  if (typeof raw === "string") {
    if (!raw || raw.length > 300) return null;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const parsed = signatureBoxSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
