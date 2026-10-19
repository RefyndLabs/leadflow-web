"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { products, useVariantMutations, useVariants } from "@/lib/api/hooks";
import { ApiError, describeError } from "@/lib/api/errors";
import { applyApiError, useFormBanner, useZodForm } from "@/lib/forms";
import { parseAttributes } from "@/lib/product-import";
import { variantCreate } from "@/lib/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  EmptyState,
  ErrorState,
  InlineAlert,
  RowsSkeleton,
  Skeleton,
} from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { useAuth } from "./auth";
import { ProductDialog } from "./catalog";
import { PageHeader } from "./page-header";

function VariantDialog({
  productId,
  open,
  onOpenChange,
}: {
  productId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { create } = useVariantMutations(productId);
  const { banner, setBanner, clear } = useFormBanner();
  const [attrs, setAttrs] = React.useState("");
  const [attrError, setAttrError] = React.useState<string | undefined>();
  const form = useZodForm(variantCreate, { name: "", sku: "" });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    clear();
    const parsed = parseAttributes(attrs);
    if (parsed.error) return setAttrError(parsed.error);
    setAttrError(undefined);
    try {
      await create.mutateAsync({
        ...values,
        ...(parsed.value ? { attributes: parsed.value } : {}),
      });
      toast.success("Variant added");
      onOpenChange(false);
    } catch (e) {
      setBanner(applyApiError(form as never, e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New variant"
        description="A size, grade or pack of this product with its own SKU."
      >
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {banner && <InlineAlert>{banner}</InlineAlert>}
          <Field
            label="Name"
            required
            error={errors.name?.message as string | undefined}
          >
            <Input maxLength={300} autoFocus {...form.register("name")} />
          </Field>
          <Field
            label="SKU"
            required
            error={errors.sku?.message as string | undefined}
          >
            <Input
              maxLength={100}
              autoCapitalize="characters"
              {...form.register("sku")}
            />
          </Field>
          <Field
            label="Attributes"
            hint="One per line, like  size: 10 kg"
            error={attrError}
          >
            <Textarea
              rows={3}
              value={attrs}
              onChange={(e) => setAttrs(e.target.value)}
              placeholder={"size: 10 kg\ngrade: A"}
            />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Add variant
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProductDetail({ id }: { id: string }) {
  const router = useRouter();
  const { can } = useAuth();
  const confirm = useConfirm();
  const q = products.useOne(id);
  const variants = useVariants(id);
  const { remove: removeVariant } = useVariantMutations(id);
  const removeProduct = products.useRemove({ handled: true });
  const updateProduct = products.useUpdate({ handled: true });
  const [editing, setEditing] = React.useState(false);
  const [addingVariant, setAddingVariant] = React.useState(false);
  const canWrite = can("catalog:write");

  if (q.isPending) return <Skeleton className="h-64 w-full rounded-[14px]" />;
  if (q.isError)
    return (
      <>
        <PageHeader
          title="Product"
          back={{ href: "/catalog", label: "Catalog" }}
        />
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </>
    );
  const p = q.data;

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete ${p.name}?`,
      description:
        "Its variants are deleted with it. A product that leads still reference can't be deleted.",
      confirmLabel: "Delete product",
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeProduct.mutateAsync(p.id);
      toast.success("Product deleted");
      router.replace("/catalog");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // Linked to leads, so it can't be deleted. Retiring it keeps those leads intact.
        const retire = await confirm({
          title: "This product is on existing leads",
          description: `${e.detail} Mark it inactive instead? It stays on those leads but is no longer suggested.`,
          confirmLabel: "Mark inactive",
        });
        if (retire) await setActive(false);
      } else toast.error(describeError(e), { duration: 8000 });
    }
  };

  const setActive = async (is_active: boolean) => {
    try {
      await updateProduct.mutateAsync({ id: p.id, body: { is_active } });
      toast.success(is_active ? "Product reactivated" : "Product marked inactive");
    } catch (e) {
      toast.error(describeError(e));
    }
  };

  const facts: [string, React.ReactNode][] = [
    [
      "SKU",
      <span key="sku" className="font-mono">
        {p.sku}
      </span>,
    ],
    ["Category", p.category],
    ["HS code", p.hs_code],
    ["Minimum order", p.moq],
    ["Packaging", p.packaging_details],
  ];

  return (
    <>
      <PageHeader
        back={{ href: "/catalog", label: "Catalog" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.name}
            {p.is_active === false && <Badge>Inactive</Badge>}
          </span>
        }
        description={p.description ?? undefined}
        actions={
          canWrite && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditing(true)}
              >
                <Pencil aria-hidden />
                Edit
              </Button>
              {p.is_active === false ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={updateProduct.isPending}
                  onClick={() => void setActive(true)}
                >
                  Reactivate
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={updateProduct.isPending}
                  onClick={() => void setActive(false)}
                >
                  Mark inactive
                </Button>
              )}
              <Button
                variant="danger-tint"
                size="sm"
                onClick={() => void onDelete()}
              >
                <Trash2 aria-hidden />
                Delete
              </Button>
            </>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardBody className="pt-2">
            <dl className="divide-y divide-line text-[14px]">
              {facts.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2.5">
                  <dt className="text-muted">{k}</dt>
                  <dd className="min-w-0 truncate text-right">
                    {v || <span className="text-muted">—</span>}
                  </dd>
                </div>
              ))}
              <div className="py-2.5">
                <dt className="mb-1.5 text-muted">Certifications</dt>
                <dd className="flex flex-wrap gap-1">
                  {p.certifications?.length ? (
                    p.certifications.map((c) => (
                      <Badge key={c} tone="success">
                        {c}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </dd>
              </div>
              <div className="py-2.5">
                <dt className="mb-1.5 text-muted">Other names</dt>
                <dd className="flex flex-wrap gap-1">
                  {p.aliases?.length ? (
                    p.aliases.map((a) => (
                      <Badge key={a} tone="accent">
                        {a}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </dd>
              </div>
              <div className="py-2.5">
                <dt className="mb-1.5 text-muted">Tags</dt>
                <dd className="flex flex-wrap gap-1">
                  {p.tags?.length ? (
                    p.tags.map((c) => <Badge key={c}>{c}</Badge>)
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Variants</CardTitle>
            {canWrite && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setAddingVariant(true)}
              >
                <Plus aria-hidden />
                Add
              </Button>
            )}
          </CardHeader>
          <div className="mt-3">
            {variants.isPending ? (
              <RowsSkeleton rows={2} />
            ) : variants.isError ? (
              <ErrorState
                error={variants.error}
                onRetry={() => void variants.refetch()}
              />
            ) : variants.data.length === 0 ? (
              <EmptyState
                title="No variants"
                description="Add variants if this product comes in different sizes or grades."
                className="py-8"
              />
            ) : (
              <ul className="divide-y divide-line">
                {variants.data.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-start gap-3 px-4 py-3 sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium">
                        {v.name}{" "}
                        <span className="font-mono text-[13px] text-muted">
                          {v.sku}
                        </span>
                      </p>
                      {v.attributes && Object.keys(v.attributes).length > 0 && (
                        <p className="mt-1 flex flex-wrap gap-1">
                          {Object.entries(v.attributes).map(([k, val]) => (
                            <Badge key={k}>
                              {k}: {String(val)}
                            </Badge>
                          ))}
                        </p>
                      )}
                    </div>
                    {canWrite && (
                      // Variants have no PATCH in the API: change one by deleting and re-adding it.
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete variant ${v.name}`}
                        onClick={async () => {
                          if (
                            await confirm({
                              title: `Delete ${v.name}?`,
                              description:
                                "To change a variant, delete it and add it again.",
                              confirmLabel: "Delete variant",
                              destructive: true,
                            })
                          )
                            removeVariant.mutate(v.id);
                        }}
                      >
                        <Trash2 className="text-danger" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
      {editing && <ProductDialog product={p} open onOpenChange={setEditing} />}
      {addingVariant && (
        <VariantDialog productId={id} open onOpenChange={setAddingVariant} />
      )}
    </>
  );
}
