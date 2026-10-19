"use client";

import * as React from "react";
import Link from "next/link";
import { Package, Pencil } from "lucide-react";
import { describeError } from "@/lib/api/errors";
import { products as productsApi, useSetLeadProducts } from "@/lib/api/hooks";
import type { LeadProduct } from "@/lib/api/types";
import { productSourceLabel } from "@/lib/enums";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState, InlineAlert } from "@/components/ui/feedback";
import { useAuth } from "./auth";
import { ProductPicker, productsPayload, type PickedProduct } from "./product-picker";

const SOURCE_TONE: Record<string, Tone> = { extraction: "accent", research: "success", manual: "neutral" };

export function LeadProductsCard({
  leadId,
  items,
  canWrite,
}: {
  leadId: string;
  items: LeadProduct[];
  canWrite: boolean;
}) {
  const { can } = useAuth();
  const [editing, setEditing] = React.useState(false);
  const catalogue = productsApi.useList({ limit: 200 }, { enabled: can("catalog:read") });
  const moq = (id: string) => catalogue.data?.items.find((p) => p.id === id)?.moq;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Products</CardTitle>
        {canWrite && can("catalog:read") && (
          <Button variant="ghost" size="sm" aria-label="Edit products" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            Edit
          </Button>
        )}
      </CardHeader>
      <CardBody className="pt-2">
        {items.length === 0 ? (
          <EmptyState icon={Package} className="py-6" title="No products yet" description="Add what they asked about." />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((p) => (
              <li key={p.product_id} className="py-2.5 text-[14px]">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/catalog/products/${p.product_id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  {p.is_primary && <Badge tone="accent">Main</Badge>}
                  <Badge tone={SOURCE_TONE[p.source] ?? "neutral"}>{productSourceLabel(p.source)}</Badge>
                </div>
                <p className="text-[13px] text-muted">
                  {[p.quantity && `Qty ${p.quantity}`, moq(p.product_id) && `MOQ ${moq(p.product_id)}`, p.note]
                    .filter(Boolean)
                    .join(" · ") || p.sku}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      {editing && <EditProducts leadId={leadId} items={items} onClose={() => setEditing(false)} />}
    </Card>
  );
}

function EditProducts({ leadId, items, onClose }: { leadId: string; items: LeadProduct[]; onClose: () => void }) {
  const save = useSetLeadProducts(leadId, { handled: true, success: "Products saved" });
  const [error, setError] = React.useState<string | null>(null);
  const [list, setList] = React.useState<PickedProduct[]>(() =>
    // The main product first, as the API expects for the replacement list.
    [...items]
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((p) => ({
        product_id: p.product_id,
        name: p.name,
        sku: p.sku,
        quantity: p.quantity ?? "",
        note: p.note ?? "",
      })),
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Products on this lead"
        description="This replaces the list. The starred product is the main one."
        className="sm:max-w-xl"
      >
        <div className="space-y-4">
          {error && <InlineAlert>{error}</InlineAlert>}
          <ProductPicker value={list} onChange={setList} />
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              loading={save.isPending}
              onClick={async () => {
                setError(null);
                try {
                  await save.mutateAsync(productsPayload(list).products ?? []);
                  onClose();
                } catch (e) {
                  setError(describeError(e));
                }
              }}
            >
              Save products
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
