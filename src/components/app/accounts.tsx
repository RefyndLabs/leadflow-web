"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { accounts, contacts } from "@/lib/api/hooks";
import { ApiError, describeError } from "@/lib/api/errors";
import type { Account } from "@/lib/api/types";
import { countryName, countryOptions } from "@/lib/countries";
import { countryFlag, formatDate, formatPhone, safeHttpUrl } from "@/lib/format";
import { applyApiError, useFormBanner, useZodForm } from "@/lib/forms";
import { accountCreate, accountUpdate } from "@/lib/schemas";
import { useUrlState } from "@/lib/use-url-state";
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
import { Input } from "@/components/ui/input";
import { PAGE_SIZE, Pagination } from "@/components/ui/pagination";
import { useAuth } from "./auth";
import { PageHeader } from "./page-header";
import { FormSelect } from "./pickers";

export function AccountDialog({
  account,
  open,
  onOpenChange,
  onSaved,
}: {
  account?: Account;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved?: (a: Account) => void;
}) {
  const editing = Boolean(account);
  const create = accounts.useCreate({
    handled: true,
    success: "Company added",
  });
  const update = accounts.useUpdate({
    handled: true,
    success: "Company updated",
  });
  const { banner, setBanner, clear } = useFormBanner();
  const form = useZodForm(editing ? accountUpdate : accountCreate, {
    name: account?.name ?? "",
    domain: account?.domain ?? "",
    industry: account?.industry ?? "",
    location: account?.location ?? "",
    country: account?.country ?? "",
    website: account?.website ?? "",
  } as never);
  const countries = React.useMemo(() => countryOptions(), []);
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    clear();
    try {
      const saved = editing
        ? await update.mutateAsync({
            id: account!.id,
            body: values as Record<string, unknown>,
          })
        : await create.mutateAsync(values as Record<string, unknown>);
      onOpenChange(false);
      onSaved?.(saved);
    } catch (e) {
      setBanner(applyApiError(form as never, e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? "Edit company" : "New company"}>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {banner && <InlineAlert>{banner}</InlineAlert>}
          <Field
            label="Company name"
            required
            error={errors.name?.message as string | undefined}
          >
            <Input maxLength={300} autoFocus {...form.register("name")} />
          </Field>
          <Field
            label="Website"
            error={errors.website?.message as string | undefined}
          >
            <Input
              maxLength={500}
              autoCapitalize="none"
              inputMode="url"
              placeholder="example.com"
              {...form.register("website")}
            />
          </Field>
          <Field
            label="Email domain"
            hint="Used to recognise people from this company by their email."
            error={errors.domain?.message as string | undefined}
          >
            <Input
              maxLength={300}
              autoCapitalize="none"
              placeholder="example.com"
              {...form.register("domain")}
            />
          </Field>
          <FormSelect
            control={form.control as never}
            name="country"
            label="Country"
            placeholder="Not set"
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </FormSelect>
          <Field
            label="Industry"
            error={errors.industry?.message as string | undefined}
          >
            <Input maxLength={300} {...form.register("industry")} />
          </Field>
          <Field
            label="Location"
            error={errors.location?.message as string | undefined}
          >
            <Input
              maxLength={300}
              placeholder="City, country"
              {...form.register("location")}
            />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {editing ? "Save changes" : "Add company"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReviewBadge({ status }: { status: Account["review_status"] }) {
  if (status !== "needs_review") return null;
  return (
    <Badge tone="warning">
      <AlertTriangle className="size-3" aria-hidden />
      Needs review
    </Badge>
  );
}

export function AccountsList() {
  const { can } = useAuth();
  const url = useUrlState();
  const [creating, setCreating] = React.useState(false);
  const reviewOnly = url.get("review") === "1";
  const search = url.get("q");

  // The API has no search or "needs review" filter, so those views scan the newest 200 companies.
  const scanning = reviewOnly || search !== "";
  const q = accounts.useList(
    scanning ? { limit: 200 } : { skip: url.skip, limit: PAGE_SIZE },
  );
  const scan = accounts.useList({ limit: 200 }); // also feeds the review banner
  const flagged =
    scan.data?.items.filter((a) => a.review_status === "needs_review") ?? [];

  const items = React.useMemo(() => {
    let rows = q.data?.items ?? [];
    if (reviewOnly)
      rows = rows.filter((a) => a.review_status === "needs_review");
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter((a) =>
        [a.name, a.domain, a.website, a.industry, a.location].some((v) =>
          v?.toLowerCase().includes(s),
        ),
      );
    }
    return rows;
  }, [q.data, reviewOnly, search]);

  return (
    <>
      <PageHeader
        title="Companies"
        description="The businesses your contacts work for. Similar names are flagged instead of merged automatically."
        actions={
          can("accounts:write") && (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              New company
            </Button>
          )
        }
      />

      {flagged.length > 0 && !reviewOnly && (
        <InlineAlert
          tone="warning"
          className="mb-4 flex flex-wrap items-center justify-between gap-2"
        >
          <span>
            {flagged.length}{" "}
            {flagged.length === 1 ? "company is" : "companies are"} flagged as
            possible duplicates.
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => url.set({ review: "1" })}
          >
            Review them
          </Button>
        </InlineAlert>
      )}

      <div className="relative mb-4 max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          aria-label="Search companies"
          placeholder="Search name, website, location"
          className="pl-9"
          defaultValue={search}
          onChange={(e) => url.set({ q: e.target.value.trim() || null })}
        />
      </div>
      {reviewOnly && (
        <div className="mb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => url.set({ review: null })}
          >
            ← All companies
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
        {q.isPending ? (
          <RowsSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={scanning ? "No companies match" : "No companies yet"}
            description={
              scanning
                ? "Try a different search."
                : "Companies appear as leads come in, or add one yourself."
            }
            action={
              !scanning && can("accounts:write") ? (
                <Button onClick={() => setCreating(true)}>
                  <Plus aria-hidden />
                  New company
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {items.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/accounts/${a.id}`}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2 sm:px-5"
                  >
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-muted"
                      aria-hidden
                    >
                      <Building2 className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">
                        {a.name}
                      </span>
                      <span className="block truncate text-[13px] text-muted">
                        {[a.industry, a.location, a.domain]
                          .filter(Boolean)
                          .join(" · ") || "No details yet"}
                      </span>
                    </span>
                    <ReviewBadge status={a.review_status} />
                    <ChevronRight
                      className="hidden size-4 shrink-0 text-muted sm:block"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
            {scanning ? (
              <p className="border-t border-line px-4 py-3 text-[13px] text-muted sm:px-5">
                Searched the {q.data?.items.length} most recent companies.
              </p>
            ) : (
              <Pagination
                skip={url.skip}
                total={q.data?.total}
                count={q.data?.items.length ?? 0}
                onChange={(s) =>
                  url.set({ skip: s || null }, { keepSkip: true })
                }
                noun="companies"
              />
            )}
          </>
        )}
      </Card>
      {creating && <AccountDialog open onOpenChange={setCreating} />}
    </>
  );
}

function Field2({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 text-[14px]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right">
        {value || <span className="text-muted">—</span>}
      </dd>
    </div>
  );
}

export function AccountDetail({ id }: { id: string }) {
  const router = useRouter();
  const { can } = useAuth();
  const confirm = useConfirm();
  const q = accounts.useOne(id);
  const remove = accounts.useRemove({ handled: true });
  const [editing, setEditing] = React.useState(false);
  const dup = accounts.useOne(q.data?.possible_duplicate_of_id);
  const people = contacts.useList(
    { limit: 200 },
    { enabled: can("contacts:read") },
  );
  const related = people.data?.items.filter((c) => c.account_id === id) ?? [];

  if (q.isPending) return <Skeleton className="h-64 w-full rounded-[14px]" />;
  if (q.isError)
    return (
      <>
        <PageHeader
          title="Company"
          back={{ href: "/accounts", label: "Companies" }}
        />
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </>
    );
  const a = q.data;

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete ${a.name}?`,
      description:
        "This can't be undone. A company that still has contacts or leads can't be deleted.",
      confirmLabel: "Delete company",
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(a.id);
      toast.success("Company deleted");
      router.replace("/accounts");
    } catch (e) {
      toast.error(
        e instanceof ApiError && e.status === 409 ? e.detail : describeError(e),
        { duration: 8000 },
      );
    }
  };

  return (
    <>
      <PageHeader
        back={{ href: "/accounts", label: "Companies" }}
        title={a.name}
        description={<ReviewBadge status={a.review_status} />}
        actions={
          <>
            {can("accounts:write") && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditing(true)}
              >
                <Pencil aria-hidden />
                Edit
              </Button>
            )}
            {can("accounts:delete") && (
              <Button
                variant="danger-tint"
                size="sm"
                onClick={() => void onDelete()}
              >
                <Trash2 aria-hidden />
                Delete
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardBody className="pt-2">
            <dl className="divide-y divide-line">
              <Field2
                label="Website"
                value={
                  safeHttpUrl(a.website) ? (
                    <a
                      href={safeHttpUrl(a.website)!}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-accent hover:underline"
                    >
                      {a.website!.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </a>
                  ) : null
                }
              />
              <Field2 label="Email domain" value={a.domain} />
              <Field2
                label="Country"
                value={
                  a.country ? (
                    <>
                      <span aria-hidden>{countryFlag(a.country)} </span>
                      {countryName(a.country)}
                    </>
                  ) : null
                }
              />
              <Field2 label="Industry" value={a.industry} />
              <Field2 label="Location" value={a.location} />
              <Field2 label="Added" value={formatDate(a.created_at)} />
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contacts</CardTitle>
          </CardHeader>
          <CardBody className="pt-2">
            {!can("contacts:read") ? (
              <p className="text-[14px] text-muted">
                Contacts aren&apos;t available for your role.
              </p>
            ) : people.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : related.length === 0 ? (
              <p className="text-[14px] text-muted">
                No contacts linked to this company yet.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {related.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/contacts/${c.id}`}
                      className="flex items-center justify-between gap-3 py-2.5 text-[14px] hover:underline"
                    >
                      <span className="truncate font-medium">{c.name}</span>
                      <span className="shrink-0 text-muted">
                        {c.designation ?? (c.phone ? formatPhone(c.phone) : c.email)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {a.review_status === "needs_review" && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Possible duplicate</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-[14px] text-muted">
                The name is close to another company, so it wasn&apos;t merged
                automatically. Compare them below. There&apos;s no merge action
                yet: to combine them, move the contacts and leads onto one
                company, then delete the other.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {[a, dup.data].map((x, i) => (
                  <div
                    key={x?.id ?? i}
                    className="rounded-[12px] border border-line p-4"
                  >
                    <p className="text-[12px] font-medium uppercase tracking-wide text-muted">
                      {i === 0 ? "This company" : "Looks similar to"}
                    </p>
                    {x ? (
                      <>
                        <Link
                          href={`/accounts/${x.id}`}
                          className="mt-1 block text-[16px] font-semibold hover:underline"
                        >
                          {x.name}
                        </Link>
                        <p className="text-[14px] text-muted">
                          {[x.industry, x.location, x.domain]
                            .filter(Boolean)
                            .join(" · ") || "No details"}
                        </p>
                      </>
                    ) : dup.isPending ? (
                      <Skeleton className="mt-2 h-10 w-full" />
                    ) : (
                      <p className="mt-1 text-[14px] text-muted">
                        Not available
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}
      </div>
      {editing && <AccountDialog account={a} open onOpenChange={setEditing} />}
    </>
  );
}
