"use client";

import * as React from "react";
import { Search, Star, X } from "lucide-react";
import { products as productsApi, useProductMatch } from "@/lib/api/hooks";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "./auth";

/** One product on an enquiry, as the forms hold it. The first item is the main product. */
export interface PickedProduct {
  product_id: string;
  name: string;
  sku?: string | null;
  quantity: string;
  note: string;
  /** Why it was suggested, shown as a badge: heard in the voice note, or read in the transcript. */
  origin?: "voice" | "transcript" | null;
  /** What the buyer actually said, e.g. "haldi powder". */
  mentions?: string[];
}

/** Picked list → API `products[]` + `product_id` (the main one). */
export function productsPayload(list: PickedProduct[]) {
  if (list.length === 0) return {};
  return {
    product_id: list[0]!.product_id,
    products: list.map((p) => ({
      product_id: p.product_id,
      ...(p.quantity.trim() ? { quantity: p.quantity.trim() } : {}),
      ...(p.note.trim() ? { note: p.note.trim() } : {}),
    })),
  };
}

/**
 * Multi-select of catalogue products with quantity and note per product. Search as you type uses
 * `/products/match`, which understands aliases in other languages ("haldi", "jeera"), spelling slips
 * and whole sentences, and never suggests discontinued products.
 */
export function ProductPicker({
  value,
  onChange,
  disabled,
  label = "Products",
  hint,
}: {
  value: PickedProduct[];
  onChange: (next: PickedProduct[]) => void;
  disabled?: boolean;
  label?: string;
  hint?: React.ReactNode;
}) {
  const { can } = useAuth();
  const uid = React.useId();
  const [q, setQ] = React.useState("");
  const dq = useDebounced(q.trim(), 300);
  const match = useProductMatch(dq, can("catalog:read") && !disabled);
  // MOQ belongs to the product: one cached catalogue read gives the hint for every row.
  const catalogue = productsApi.useList(
    { limit: 200 },
    { enabled: can("catalog:read") },
  );
  const byId = React.useMemo(
    () => new Map(catalogue.data?.items.map((p) => [p.id, p]) ?? []),
    [catalogue.data],
  );
  const picked = new Set(value.map((p) => p.product_id));
  const results = (match.data ?? []).filter((m) => !picked.has(m.product.id));

  const update = (i: number, patch: Partial<PickedProduct>) =>
    onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const remove = (i: number) => onChange(value.filter((_p, j) => j !== i));
  const makeMain = (i: number) =>
    onChange([value[i]!, ...value.filter((_p, j) => j !== i)]);

  return (
    <div className="space-y-2">
      <label htmlFor={`${uid}-search`} className="block text-[13px] font-medium">
        {label}
        <span className="sr-only"> (optional)</span>
      </label>
      {value.length > 0 && (
        <ul className="space-y-2" aria-label={`Selected ${label.toLowerCase()}`}>
          {value.map((p, i) => {
            const moq = byId.get(p.product_id)?.moq;
            const main = i === 0;
            return (
              <li
                key={p.product_id}
                className={cn(
                  "rounded-[12px] border p-3",
                  main ? "border-accent" : "border-line",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="-ml-1 size-9 sm:size-8"
                    aria-label={main ? `${p.name} is the main product` : `Make ${p.name} the main product`}
                    aria-pressed={main}
                    disabled={disabled || main}
                    onClick={() => makeMain(i)}
                  >
                    <Star
                      className={cn(main ? "fill-current text-accent" : "text-muted")}
                      aria-hidden
                    />
                  </Button>
                  <span className="min-w-0 flex-1 text-[14px] font-medium">
                    {p.name}
                    {p.sku && (
                      <span className="ml-1.5 font-mono text-[12px] font-normal text-muted">
                        {p.sku}
                      </span>
                    )}
                    {main && <span className="ml-1.5 text-[12px] font-normal text-accent">Main</span>}
                  </span>
                  {p.origin && (
                    <Badge tone="accent">
                      {p.origin === "voice" ? "Heard in voice note" : "Mentioned in transcript"}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 sm:size-8"
                    aria-label={`Remove ${p.name}`}
                    disabled={disabled}
                    onClick={() => remove(i)}
                  >
                    <X aria-hidden />
                  </Button>
                </div>
                {(p.mentions?.length || moq) && (
                  <p className="mt-1 text-[12px] text-muted">
                    {p.mentions?.length ? (
                      <>said: {p.mentions.map((m) => `“${m}”`).join(", ")}</>
                    ) : null}
                    {p.mentions?.length && moq ? " · " : null}
                    {moq ? <>MOQ {moq}</> : null}
                  </p>
                )}
                <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                  <Input
                    aria-label={`Quantity for ${p.name}`}
                    placeholder="Quantity, e.g. 2 MT"
                    maxLength={300}
                    disabled={disabled}
                    value={p.quantity}
                    onChange={(e) => update(i, { quantity: e.target.value })}
                  />
                  <Input
                    aria-label={`Note for ${p.name}`}
                    placeholder="Note, e.g. organic, 8 mm"
                    maxLength={1000}
                    disabled={disabled}
                    value={p.note}
                    onChange={(e) => update(i, { note: e.target.value })}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!disabled && can("catalog:read") && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            id={`${uid}-search`}
            type="search"
            className="pl-9"
            placeholder="Add a product: name, SKU or what they called it"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-describedby={`${uid}-hint`}
          />
        </div>
      )}
      <p id={`${uid}-hint`} className="text-[13px] text-muted">
        {hint ??
          "Understands other names, e.g. haldi, elaichi, jeera. The starred product is the main one."}
      </p>
      {dq.length >= 2 && !disabled && (
        <div role="region" aria-label="Matching products" aria-live="polite">
          {match.isPending ? (
            <p className="text-[13px] text-muted">Searching…</p>
          ) : results.length === 0 ? (
            <p className="text-[13px] text-muted">No matching products in the catalogue.</p>
          ) : (
            <ul className="divide-y divide-line rounded-[12px] border border-line">
              {results.map((m) => (
                <li key={m.product.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-[14px] hover:bg-surface-2"
                    onClick={() => {
                      onChange([
                        ...value,
                        {
                          product_id: m.product.id,
                          name: m.product.name,
                          sku: m.product.sku,
                          quantity: "",
                          note: "",
                        },
                      ]);
                      setQ("");
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{m.product.name}</span>{" "}
                      <span className="font-mono text-[12px] text-muted">{m.product.sku}</span>
                      {m.matched_term &&
                        m.matched_term.toLowerCase() !== m.product.name.toLowerCase() && (
                          <span className="block text-[12px] text-muted">
                            matched “{m.matched_term}”
                          </span>
                        )}
                    </span>
                    <span className="text-[13px] font-medium text-accent">Add</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
