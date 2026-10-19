import { productCreate } from "./schemas";

const ALIASES: Record<string, string> = {
  name: "name",
  productname: "name",
  sku: "sku",
  code: "sku",
  description: "description",
  moq: "moq",
  minimumorderquantity: "moq",
  packaging: "packaging_details",
  packagingdetails: "packaging_details",
  certifications: "certifications",
  certification: "certifications",
  tags: "tags",
  category: "category",
  hscode: "hs_code",
  hs: "hs_code",
  aliases: "aliases",
  othernames: "aliases",
  alias: "aliases",
};

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface ProductRow {
  row: number;
  payload: Record<string, unknown> | null;
  errors: string[];
}

export function buildProductRows(
  records: Record<string, unknown>[],
  headers: string[],
): ProductRow[] {
  const map = new Map<string, string>();
  for (const h of headers) {
    const f = ALIASES[norm(h)];
    if (f) map.set(h, f);
  }
  return records.map((rec, i) => {
    const flat: Record<string, string> = {};
    for (const [h, f] of map)
      flat[f] =
        rec[h] === null || rec[h] === undefined ? "" : String(rec[h]).trim();
    const parsed = productCreate.safeParse(flat);
    return parsed.success
      ? {
          row: i + 1,
          payload: parsed.data as Record<string, unknown>,
          errors: [],
        }
      : {
          row: i + 1,
          payload: null,
          errors: parsed.error.issues.map(
            (x) => `${x.path.join(".") || "row"}: ${x.message}`,
          ),
        };
  });
}

/** "size: 10kg" per line → { size: "10kg" }. Blank → null. Returns an error string for a malformed line. */
export function parseAttributes(input: string): {
  value: Record<string, string> | null;
  error?: string;
} {
  const lines = input
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { value: null };
  const out: Record<string, string> = {};
  for (const line of lines) {
    const idx = line.search(/[:=]/);
    if (idx <= 0)
      return { value: null, error: `“${line}” should look like  size: 10kg` };
    const k = line.slice(0, idx).trim();
    if (["__proto__", "constructor", "prototype"].includes(k))
      return { value: null, error: `“${k}” isn't allowed as a name` };
    out[k] = line.slice(idx + 1).trim();
  }
  return { value: out };
}
