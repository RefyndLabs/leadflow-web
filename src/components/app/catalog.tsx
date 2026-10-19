"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronRight,
  ExternalLink,
  FileText,
  HelpCircle,
  Library,
  Package,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import {
  catalogue,
  collaterals,
  faqs,
  products,
  useBulkProducts,
  useProductCategories,
} from "@/lib/api/hooks";
import type { Collateral, LibraryItem, Product } from "@/lib/api/types";
import { COLLATERAL_LABEL, COLLATERAL_TYPES } from "@/lib/enums";
import { safeHttpUrl } from "@/lib/format";
import { applyApiError, useFormBanner, useZodForm } from "@/lib/forms";
import {
  collateralCreate,
  collateralUpdate,
  libraryItemCreate,
  libraryItemUpdate,
  productCreate,
  productUpdate,
} from "@/lib/schemas";
import { buildProductRows } from "@/lib/product-import";
import { parseCsv, sheetToRecords } from "@/lib/import";
import { describeError } from "@/lib/api/errors";
import { useDebounced } from "@/lib/use-debounced";
import { useUrlState } from "@/lib/use-url-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  EmptyState,
  ErrorState,
  InlineAlert,
  RowsSkeleton,
} from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { PAGE_SIZE, Pagination } from "@/components/ui/pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "./auth";
import { PageHeader } from "./page-header";
import { FormSelect } from "./pickers";

const tagsOf = (t: string[] | null | undefined) =>
  t && t.length ? t.join(", ") : "";

function TagList({ tags }: { tags: string[] | null | undefined }) {
  if (!tags?.length) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {tags.slice(0, 5).map((t) => (
        <Badge key={t}>{t}</Badge>
      ))}
    </span>
  );
}

/* ── Products ─────────────────────────────────────────────────────── */
export function ProductDialog({
  product,
  open,
  onOpenChange,
}: {
  product?: Product;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const editing = Boolean(product);
  const create = products.useCreate({
    handled: true,
    success: "Product added",
  });
  const update = products.useUpdate({
    handled: true,
    success: "Product updated",
  });
  const { banner, setBanner, clear } = useFormBanner();
  const form = useZodForm(editing ? productUpdate : productCreate, {
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    description: product?.description ?? "",
    moq: product?.moq ?? "",
    packaging_details: product?.packaging_details ?? "",
    certifications: tagsOf(product?.certifications),
    tags: tagsOf(product?.tags),
    category: product?.category ?? "",
    hs_code: product?.hs_code ?? "",
    aliases: tagsOf(product?.aliases),
    is_active: product?.is_active ?? true,
  } as never);
  const { errors } = form.formState;
  const categories = useProductCategories(open);
  const categoryList = React.useId();

  const onSubmit = form.handleSubmit(async (values) => {
    clear();
    try {
      if (editing)
        await update.mutateAsync({
          id: product!.id,
          body: values as Record<string, unknown>,
        });
      else await create.mutateAsync(values as Record<string, unknown>);
      onOpenChange(false);
    } catch (e) {
      setBanner(applyApiError(form as never, e)); // 409 = SKU already used
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? "Edit product" : "New product"}>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {banner && <InlineAlert>{banner}</InlineAlert>}
          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Category"
              error={errors.category?.message as string | undefined}
            >
              <Input
                maxLength={200}
                list={categoryList}
                placeholder="e.g. Spices"
                {...form.register("category")}
              />
            </Field>
            <datalist id={categoryList}>
              {categories.data?.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <Field
              label="HS code"
              error={errors.hs_code?.message as string | undefined}
            >
              <Input
                maxLength={20}
                inputMode="numeric"
                placeholder="e.g. 0910.30"
                {...form.register("hs_code")}
              />
            </Field>
          </div>
          <Field
            label="Other names / aliases"
            hint="Names buyers use in other languages, e.g. haldi, kurkuma. Used to recognise the product in voice notes. Separate with commas."
            error={errors.aliases?.message as string | undefined}
          >
            <Input placeholder="haldi, kurkuma, curcuma" {...form.register("aliases")} />
          </Field>
          <Field
            label="Description"
            error={errors.description?.message as string | undefined}
          >
            <Textarea
              rows={3}
              maxLength={10000}
              {...form.register("description")}
            />
          </Field>
          <Field
            label="Minimum order quantity"
            error={errors.moq?.message as string | undefined}
          >
            <Input
              maxLength={300}
              placeholder="e.g. 500 kg"
              {...form.register("moq")}
            />
          </Field>
          <Field
            label="Packaging"
            error={errors.packaging_details?.message as string | undefined}
          >
            <Input maxLength={2000} {...form.register("packaging_details")} />
          </Field>
          <Field
            label="Certifications"
            hint="Separate with commas."
            error={errors.certifications?.message as string | undefined}
          >
            <Input
              placeholder="ISO 9001, FSSAI"
              {...form.register("certifications")}
            />
          </Field>
          <Field
            label="Tags"
            hint="Separate with commas."
            error={errors.tags?.message as string | undefined}
          >
            <Input {...form.register("tags")} />
          </Field>
          <label className="flex items-start gap-3 text-[14px]">
            <Checkbox className="mt-0.5" {...form.register("is_active")} />
            <span>
              <span className="font-medium">Active</span>
              <span className="block text-[13px] text-muted">
                Inactive products stay on existing leads but are never suggested for new ones.
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {editing ? "Save changes" : "Add product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProductBulkDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const bulk = useBulkProducts();
  const [rows, setRows] = React.useState<ReturnType<
    typeof buildProductRows
  > | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{
    ok: number;
    failed: { row: number; error: string }[];
  } | null>(null);

  const load = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      let parsed;
      if (/\.xlsx$/i.test(file.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        parsed = sheetToRecords((await readSheet(file)) as unknown[][]);
      } else parsed = parseCsv(await file.text());
      if (parsed.records.length === 0)
        return setError(
          "No rows found. The first row should be the column headers.",
        );
      if (parsed.records.length > 500)
        return setError("Upload up to 500 products at a time.");
      setRows(buildProductRows(parsed.records, parsed.headers));
    } catch {
      setError("That file couldn't be read.");
    }
  };

  const valid = rows?.filter((r) => r.payload) ?? [];
  const submit = async () => {
    try {
      const res = await bulk.mutateAsync(valid.map((r) => r.payload!));
      setResult({
        ok: res.succeeded,
        failed: res.results
          .filter((r) => !r.ok)
          .map((r) => ({
            row: valid[r.index]?.row ?? r.index + 1,
            error: r.error ?? "Failed",
          })),
      });
      setRows(null);
    } catch (e) {
      setError(describeError(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Upload products"
        description="A .csv or .xlsx with columns: name, sku, category, hs_code, aliases, description, moq, packaging_details, certifications, tags."
      >
        <div className="space-y-4">
          {error && <InlineAlert>{error}</InlineAlert>}
          {result ? (
            <div className="space-y-3">
              <InlineAlert tone={result.failed.length ? "warning" : "success"}>
                {result.ok} added
                {result.failed.length > 0 && `, ${result.failed.length} failed`}
                .
              </InlineAlert>
              {result.failed.length > 0 && (
                <ul className="space-y-1 text-[14px]">
                  {result.failed.map((f) => (
                    <li key={f.row}>
                      <span className="text-muted">Row {f.row}:</span> {f.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : rows ? (
            <div className="space-y-3">
              <p className="text-[14px]">
                {valid.length} ready, {rows.length - valid.length} with
                problems.
              </p>
              {rows.some((r) => !r.payload) && (
                <ul className="max-h-40 space-y-1 overflow-auto text-[13px] text-danger">
                  {rows
                    .filter((r) => !r.payload)
                    .map((r) => (
                      <li key={r.row}>
                        Row {r.row}: {r.errors.join("; ")}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          ) : (
            <input
              type="file"
              accept=".csv,.xlsx,text/csv"
              onChange={(e) => void load(e.target.files?.[0])}
              className="block w-full text-[14px] file:mr-3 file:rounded-[10px] file:border-0 file:bg-surface-2 file:px-4 file:py-2.5 file:text-[14px] file:font-medium"
              aria-label="Products file"
            />
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {result ? "Done" : "Cancel"}
            </Button>
            {rows && (
              <Button
                disabled={valid.length === 0}
                loading={bulk.isPending}
                onClick={() => void submit()}
              >
                <Upload aria-hidden />
                Add {valid.length} product{valid.length === 1 ? "" : "s"}
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProductsTab() {
  const { can } = useAuth();
  const url = useUrlState();
  const [search, setSearch] = React.useState(url.get("q"));
  const dSearch = useDebounced(search.trim(), 400);
  const category = url.get("category");
  const active = url.get("active");
  const q = products.useList({
    q: dSearch.length >= 2 ? dSearch : undefined,
    category: category || undefined,
    active: active === "true" || active === "false" ? active : undefined,
    skip: url.skip,
    limit: PAGE_SIZE,
  });
  const categories = useProductCategories();
  const [dialog, setDialog] = React.useState<"new" | "bulk" | null>(null);
  const canWrite = can("catalog:write");
  const filtered = Boolean(dSearch || category || active);

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDialog("bulk")}>
            <Upload aria-hidden />
            Upload file
          </Button>
          <Button onClick={() => setDialog("new")}>
            <Plus aria-hidden />
            New product
          </Button>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Input
          type="search"
          aria-label="Search products"
          placeholder="Search name, SKU or another name (haldi, jeera…)"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (url.skip) url.set({ skip: null, tab: "products" }, { keepSkip: true });
          }}
        />
        <Select
          aria-label="Category"
          value={category}
          onChange={(e) => url.set({ category: e.target.value, tab: "products" })}
        >
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Active or inactive"
          value={active}
          onChange={(e) => url.set({ active: e.target.value, tab: "products" })}
        >
          <option value="">Active and inactive</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </Select>
      </div>
      <Card className="overflow-hidden">
        {q.isPending ? (
          <RowsSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.items.length === 0 && filtered ? (
          <EmptyState icon={Package} title="No products match" description="Try another search or filter." />
        ) : q.data.items.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No products yet"
            description="Products let you tag leads by what they asked for and report by product."
            action={
              canWrite ? (
                <Button onClick={() => setDialog("new")}>
                  <Plus aria-hidden />
                  Add a product
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {q.data.items.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/catalog/products/${p.id}`}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2 sm:px-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 truncate text-[15px] font-medium">
                        {p.name}
                        {p.is_active === false && <Badge>Inactive</Badge>}
                      </span>
                      <span className="block truncate text-[13px] text-muted">
                        <span className="font-mono">{p.sku}</span>
                        {p.category && <> · {p.category}</>}
                        {p.moq && <> · MOQ {p.moq}</>}
                      </span>
                      <TagList tags={p.certifications} />
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination
              skip={url.skip}
              total={q.data.total}
              count={q.data.items.length}
              onChange={(s) =>
                url.set(
                  { skip: s || null, tab: "products" },
                  { keepSkip: true },
                )
              }
              noun="products"
            />
          </>
        )}
      </Card>
      {dialog === "new" && (
        <ProductDialog open onOpenChange={() => setDialog(null)} />
      )}
      {dialog === "bulk" && (
        <ProductBulkDialog open onOpenChange={() => setDialog(null)} />
      )}
    </div>
  );
}

/* ── Collateral ───────────────────────────────────────────────────── */
function CollateralDialog({
  item,
  open,
  onOpenChange,
}: {
  item?: Collateral;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const editing = Boolean(item);
  const create = collaterals.useCreate({
    handled: true,
    success: "Collateral added",
  });
  const update = collaterals.useUpdate({
    handled: true,
    success: "Collateral updated",
  });
  const { banner, setBanner, clear } = useFormBanner();
  const form = useZodForm(editing ? collateralUpdate : collateralCreate, {
    name: item?.name ?? "",
    description: item?.description ?? "",
    file_url: item?.file_url ?? "",
    type: item?.type ?? "pdf",
    tags: tagsOf(item?.tags),
  } as never);
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    clear();
    try {
      if (editing)
        await update.mutateAsync({
          id: item!.id,
          body: values as Record<string, unknown>,
        });
      else await create.mutateAsync(values as Record<string, unknown>);
      onOpenChange(false);
    } catch (e) {
      setBanner(applyApiError(form as never, e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? "Edit collateral" : "New collateral"}
        description="Brochures, certificates and videos your team shares with buyers. Files are linked, not uploaded here."
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
          <FormSelect
            control={form.control as never}
            name="type"
            label="Type"
            required
          >
            {COLLATERAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {COLLATERAL_LABEL[t]}
              </option>
            ))}
          </FormSelect>
          <Field
            label="Link"
            required
            error={errors.file_url?.message as string | undefined}
          >
            <Input
              type="url"
              inputMode="url"
              placeholder="https://…"
              {...form.register("file_url")}
            />
          </Field>
          <Field
            label="Description"
            error={errors.description?.message as string | undefined}
          >
            <Textarea
              rows={2}
              maxLength={10000}
              {...form.register("description")}
            />
          </Field>
          <Field
            label="Tags"
            hint="Separate with commas. Used to match collateral to enquiries."
            error={errors.tags?.message as string | undefined}
          >
            <Input {...form.register("tags")} />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {editing ? "Save changes" : "Add collateral"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CollateralTab() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const q = collaterals.useList({ limit: 200 });
  const remove = collaterals.useRemove({ success: "Collateral deleted" });
  const [dialog, setDialog] = React.useState<{ item?: Collateral } | null>(
    null,
  );
  const canWrite = can("catalog:write");

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <Button onClick={() => setDialog({})}>
            <Plus aria-hidden />
            New collateral
          </Button>
        </div>
      )}
      <Card className="overflow-hidden">
        {q.isPending ? (
          <RowsSkeleton rows={3} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No collateral yet"
            description="Add brochures, certificates and videos so the team has one place to find them."
          />
        ) : (
          <ul className="divide-y divide-line">
            {q.data.items.map((c) => {
              const link = safeHttpUrl(c.file_url);
              return (
                <li
                  key={c.id}
                  className="flex items-center gap-3 px-4 py-3.5 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[15px] font-medium">
                      <span className="truncate">{c.name}</span>
                      <Badge>{COLLATERAL_LABEL[c.type]}</Badge>
                    </p>
                    {c.description && (
                      <p className="truncate text-[13px] text-muted">
                        {c.description}
                      </p>
                    )}
                    <TagList tags={c.tags} />
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {link && (
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        aria-label={`Open ${c.name}`}
                      >
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink />
                        </a>
                      </Button>
                    )}
                    {canWrite && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${c.name}`}
                          onClick={() => setDialog({ item: c })}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${c.name}`}
                          onClick={async () => {
                            if (
                              await confirm({
                                title: `Delete ${c.name}?`,
                                description: "This can't be undone.",
                                confirmLabel: "Delete",
                                destructive: true,
                              })
                            )
                              remove.mutate(c.id);
                          }}
                        >
                          <Trash2 className="text-danger" />
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {dialog && (
        <CollateralDialog
          item={dialog.item}
          open
          onOpenChange={() => setDialog(null)}
        />
      )}
    </div>
  );
}

/* ── Catalogue + FAQs share a shape ───────────────────────────────── */
function LibraryDialog({
  api,
  item,
  open,
  onOpenChange,
  noun,
}: {
  api: typeof catalogue;
  item?: LibraryItem;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  noun: string;
}) {
  const editing = Boolean(item);
  const create = api.useCreate({ handled: true, success: `${noun} added` });
  const update = api.useUpdate({ handled: true, success: `${noun} updated` });
  const { banner, setBanner, clear } = useFormBanner();
  const form = useZodForm(editing ? libraryItemUpdate : libraryItemCreate, {
    title: item?.title ?? "",
    content: item?.content ?? "",
    file_url: item?.file_url ?? "",
    tags: tagsOf(item?.tags),
  } as never);
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    clear();
    try {
      if (editing)
        await update.mutateAsync({
          id: item!.id,
          body: values as Record<string, unknown>,
        });
      else await create.mutateAsync(values as Record<string, unknown>);
      onOpenChange(false);
    } catch (e) {
      setBanner(applyApiError(form as never, e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`${editing ? "Edit" : "New"} ${noun.toLowerCase()}`}
      >
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {banner && <InlineAlert>{banner}</InlineAlert>}
          <Field
            label="Title"
            required
            error={errors.title?.message as string | undefined}
          >
            <Input maxLength={300} autoFocus {...form.register("title")} />
          </Field>
          <Field
            label="Content"
            error={errors.content?.message as string | undefined}
          >
            <Textarea
              rows={6}
              maxLength={50000}
              {...form.register("content")}
            />
          </Field>
          <Field
            label="Link"
            error={errors.file_url?.message as string | undefined}
          >
            <Input
              type="url"
              inputMode="url"
              placeholder="https://…"
              {...form.register("file_url")}
            />
          </Field>
          <Field
            label="Tags"
            hint="Separate with commas."
            error={errors.tags?.message as string | undefined}
          >
            <Input {...form.register("tags")} />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {editing ? "Save changes" : `Add ${noun.toLowerCase()}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LibraryTab({
  api,
  noun,
  plural,
  icon: Icon,
  empty,
}: {
  api: typeof catalogue;
  noun: string;
  plural: string;
  icon: typeof Library;
  empty: string;
}) {
  const { can } = useAuth();
  const confirm = useConfirm();
  const q = api.useList({ limit: 200 });
  const remove = api.useRemove({ success: `${noun} deleted` });
  const [dialog, setDialog] = React.useState<{ item?: LibraryItem } | null>(
    null,
  );
  const canWrite = can("catalog:write");

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <Button onClick={() => setDialog({})}>
            <Plus aria-hidden />
            New {noun.toLowerCase()}
          </Button>
        </div>
      )}
      <Card className="overflow-hidden">
        {q.isPending ? (
          <RowsSkeleton rows={3} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState
            icon={Icon}
            title={`No ${plural} yet`}
            description={empty}
          />
        ) : (
          <ul className="divide-y divide-line">
            {q.data.items.map((it) => {
              const link = safeHttpUrl(it.file_url);
              return (
                <li
                  key={it.id}
                  className="flex items-start gap-3 px-4 py-3.5 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium">{it.title}</p>
                    {it.content && (
                      <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-[13px] text-muted">
                        {it.content}
                      </p>
                    )}
                    <TagList tags={it.tags} />
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {link && (
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        aria-label={`Open ${it.title}`}
                      >
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink />
                        </a>
                      </Button>
                    )}
                    {canWrite && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${it.title}`}
                          onClick={() => setDialog({ item: it })}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${it.title}`}
                          onClick={async () => {
                            if (
                              await confirm({
                                title: `Delete “${it.title}”?`,
                                description: "This can't be undone.",
                                confirmLabel: "Delete",
                                destructive: true,
                              })
                            )
                              remove.mutate(it.id);
                          }}
                        >
                          <Trash2 className="text-danger" />
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {dialog && (
        <LibraryDialog
          api={api}
          noun={noun}
          item={dialog.item}
          open
          onOpenChange={() => setDialog(null)}
        />
      )}
    </div>
  );
}

export function Catalog() {
  const url = useUrlState();
  const tab = url.get("tab") || "products";
  return (
    <>
      <PageHeader
        title="Catalog"
        description="What you sell, and the material you share about it."
      />
      <Tabs
        value={tab}
        onValueChange={(v) =>
          url.set({ tab: v === "products" ? null : v, skip: null })
        }
      >
        <TabsList aria-label="Catalog sections">
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="collateral">Collateral</TabsTrigger>
          <TabsTrigger value="catalogue">Catalogue</TabsTrigger>
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          <ProductsTab />
        </TabsContent>
        <TabsContent value="collateral">
          <CollateralTab />
        </TabsContent>
        <TabsContent value="catalogue">
          <LibraryTab
            api={catalogue}
            noun="Catalogue item"
            plural="catalogue items"
            icon={Library}
            empty="Add catalogue entries — price lists, specs, anything you'd send a buyer."
          />
        </TabsContent>
        <TabsContent value="faqs">
          <LibraryTab
            api={faqs}
            noun="FAQ"
            plural="FAQs"
            icon={HelpCircle}
            empty="Add the questions buyers ask most, with the answers your team gives."
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
