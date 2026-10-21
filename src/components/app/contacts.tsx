"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { accounts, contacts, leads } from "@/lib/api/hooks";
import { ApiError, describeError } from "@/lib/api/errors";
import type { Contact } from "@/lib/api/types";
import { LEAD_SOURCES, sourceLabel } from "@/lib/enums";
import { formatDate, initials, telHref, formatPhone } from "@/lib/format";
import { applyApiError, useFormBanner, useZodForm } from "@/lib/forms";
import { contactCreate, contactUpdate, leadCreate } from "@/lib/schemas";
import { useUrlState } from "@/lib/use-url-state";
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
import { AccountName } from "./entities";
import { PageHeader } from "./page-header";
import {
  AccountOptions,
  EventOptions,
  FormSelect,
  ProductOptions,
  UserOptions,
} from "./pickers";
import { usePhoneHint } from "./phone";
import { SaveContactButton } from "./save-contact";

export function ContactDialog({
  contact,
  open,
  onOpenChange,
}: {
  contact?: Contact;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const editing = Boolean(contact);
  const { can } = useAuth();
  const phoneHint = usePhoneHint();
  const create = contacts.useCreate({
    handled: true,
    success: "Contact added",
  });
  const update = contacts.useUpdate({
    handled: true,
    success: "Contact updated",
  });
  const { banner, setBanner, clear } = useFormBanner();
  const form = useZodForm(editing ? contactUpdate : contactCreate, {
    name: contact?.name ?? "",
    phone: contact?.phone ?? "",
    email: contact?.email ?? "",
    designation: contact?.designation ?? "",
    whatsapp: contact?.whatsapp ?? "",
    alternate_phone: contact?.alternate_phone ?? "",
    account_id: contact?.account_id ?? "",
  } as never);
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    clear();
    try {
      if (editing)
        await update.mutateAsync({
          id: contact!.id,
          body: values as Record<string, unknown>,
        });
      else await create.mutateAsync(values as Record<string, unknown>);
      onOpenChange(false);
    } catch (e) {
      // 409: phone/email already belongs to another contact (unique per organization).
      setBanner(applyApiError(form as never, e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? "Edit contact" : "New contact"}>
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
            label="Phone"
            hint={phoneHint}
            error={errors.phone?.message as string | undefined}
          >
            <Input
              type="tel"
              inputMode="tel"
              maxLength={50}
              {...form.register("phone")}
            />
          </Field>
          <Field
            label="Email"
            error={errors.email?.message as string | undefined}
          >
            <Input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              maxLength={320}
              {...form.register("email")}
            />
          </Field>
          <Field
            label="WhatsApp"
            hint="The number to message on WhatsApp. Leave it empty to use the phone number."
            error={errors.whatsapp?.message as string | undefined}
          >
            <Input
              type="tel"
              inputMode="tel"
              maxLength={50}
              {...form.register("whatsapp")}
            />
          </Field>
          <Field
            label="Alternate number"
            hint="A second number, if they have one."
            error={errors.alternate_phone?.message as string | undefined}
          >
            <Input
              type="tel"
              inputMode="tel"
              maxLength={50}
              {...form.register("alternate_phone")}
            />
          </Field>
          <Field
            label="Job title"
            error={errors.designation?.message as string | undefined}
          >
            <Input maxLength={300} {...form.register("designation")} />
          </Field>
          {can("accounts:read") && (
            <FormSelect
              control={form.control as never}
              name="account_id"
              label="Company"
              placeholder="Not linked to a company yet"
              hint="A contact can exist before its company is confirmed."
            >
              <AccountOptions />
            </FormSelect>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {editing ? "Save changes" : "Add contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** POST /leads for a contact you have already picked. New enquiries should go through Log enquiry, which de-duplicates. */
function NewLeadDialog({
  contact,
  open,
  onOpenChange,
}: {
  contact: Contact;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { can } = useAuth();
  const router = useRouter();
  const create = leads.useCreate({ handled: true });
  const { banner, setBanner, clear } = useFormBanner();
  const form = useZodForm(leadCreate, {
    contact_id: contact.id,
    account_id: contact.account_id ?? "",
    source: "call",
    division: "",
    owner_id: "",
    event_id: "",
    product_id: "",
    lead_title: "",
    requirement_summary: "",
  } as never);
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    clear();
    try {
      const lead = await create.mutateAsync(values as Record<string, unknown>);
      toast.success("Lead created");
      onOpenChange(false);
      router.push(`/leads/${lead.id}`);
    } catch (e) {
      setBanner(applyApiError(form as never, e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`New lead for ${contact.name}`}
        description="Starts as Uncontacted. Use this when you already know the exact contact and company."
      >
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {banner && <InlineAlert>{banner}</InlineAlert>}
          {can("accounts:read") ? (
            <FormSelect
              control={form.control as never}
              name="account_id"
              label="Company"
              required
              placeholder="Choose a company"
            >
              <AccountOptions />
            </FormSelect>
          ) : (
            <p className="text-[13px] text-muted">
              A company is required, and your role can&apos;t list companies.
            </p>
          )}
          <FormSelect
            control={form.control as never}
            name="source"
            label="Source"
            required
          >
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {sourceLabel(s)}
              </option>
            ))}
          </FormSelect>
          <Field
            label="Lead title"
            error={errors.lead_title?.message as string | undefined}
          >
            <Input maxLength={200} {...form.register("lead_title")} />
          </Field>
          <Field
            label="Division"
            error={errors.division?.message as string | undefined}
          >
            <Input maxLength={200} {...form.register("division")} />
          </Field>
          {can("users:read") && (
            <FormSelect
              control={form.control as never}
              name="owner_id"
              label="Owner"
              placeholder="Unassigned"
            >
              <UserOptions />
            </FormSelect>
          )}
          {can("events:read") && (
            <FormSelect
              control={form.control as never}
              name="event_id"
              label="Exhibition"
              placeholder="None"
            >
              <EventOptions />
            </FormSelect>
          )}
          {can("catalog:read") && (
            <FormSelect
              control={form.control as never}
              name="product_id"
              label="Product of interest"
              placeholder="None"
            >
              <ProductOptions />
            </FormSelect>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Create lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ContactsList() {
  const { can } = useAuth();
  const url = useUrlState();
  const [creating, setCreating] = React.useState(false);
  const search = url.get("q");
  const scanning = search !== "";
  accounts.useList({ limit: 200 }, { enabled: can("accounts:read") }); // seeds company names
  const q = contacts.useList(
    scanning ? { limit: 200 } : { skip: url.skip, limit: PAGE_SIZE },
  );

  const items = React.useMemo(() => {
    const rows = q.data?.items ?? [];
    if (!search) return rows;
    const s = search.toLowerCase();
    // Stored numbers are international (no trunk 0), so a typed "098765…" must match "+9198765…".
    const digits = s.replace(/\D/g, "").replace(/^0+/, "");
    return rows.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        c.email?.toLowerCase().includes(s) ||
        c.designation?.toLowerCase().includes(s) ||
        (digits.length >= 3 &&
          (c.phone ?? "").replace(/\D/g, "").includes(digits)),
    );
  }, [q.data, search]);

  return (
    <>
      <PageHeader
        title="Contacts"
        description="The people behind your leads."
        actions={
          can("contacts:write") && (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              New contact
            </Button>
          )
        }
      />
      <div className="relative mb-4 max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          aria-label="Search contacts"
          placeholder="Search name, phone, email"
          className="pl-9"
          defaultValue={search}
          onChange={(e) => url.set({ q: e.target.value.trim() || null })}
        />
      </div>
      <Card className="overflow-hidden">
        {q.isPending ? (
          <RowsSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title={scanning ? "No contacts match" : "No contacts yet"}
            description={
              scanning
                ? "Try a different search."
                : "Contacts are created automatically when enquiries arrive."
            }
            action={
              !scanning && can("contacts:write") ? (
                <Button onClick={() => setCreating(true)}>
                  <Plus aria-hidden />
                  New contact
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {items.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/contacts/${c.id}`}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2 sm:px-5"
                  >
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-[13px] font-semibold text-muted"
                      aria-hidden
                    >
                      {initials(c.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">
                        {c.name}
                      </span>
                      <span className="block truncate text-[13px] text-muted">
                        {c.account_id ? (
                          <AccountName id={c.account_id} />
                        ) : (
                          "No company"
                        )}{" "}
                        ·{" "}
                        {c.phone
                          ? formatPhone(c.phone)
                          : (c.email ?? "no phone or email")}
                      </span>
                    </span>
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
                Searched the {q.data?.items.length} most recent contacts.
              </p>
            ) : (
              <Pagination
                skip={url.skip}
                total={q.data?.total}
                count={q.data?.items.length ?? 0}
                onChange={(s) =>
                  url.set({ skip: s || null }, { keepSkip: true })
                }
                noun="contacts"
              />
            )}
          </>
        )}
      </Card>
      {creating && <ContactDialog open onOpenChange={setCreating} />}
    </>
  );
}

export function ContactDetail({ id }: { id: string }) {
  const router = useRouter();
  const { can } = useAuth();
  const confirm = useConfirm();
  const q = contacts.useOne(id);
  const company = accounts.useOne(q.data?.account_id, {
    enabled: can("accounts:read"),
  });
  const remove = contacts.useRemove({ handled: true });
  const [editing, setEditing] = React.useState(false);
  const [newLead, setNewLead] = React.useState(false);

  if (q.isPending) return <Skeleton className="h-64 w-full rounded-[14px]" />;
  if (q.isError)
    return (
      <>
        <PageHeader
          title="Contact"
          back={{ href: "/contacts", label: "Contacts" }}
        />
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </>
    );
  const c = q.data;

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete ${c.name}?`,
      description:
        "This can't be undone. A contact that still has leads can't be deleted.",
      confirmLabel: "Delete contact",
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(c.id);
      toast.success("Contact deleted");
      router.replace("/contacts");
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
        back={{ href: "/contacts", label: "Contacts" }}
        title={c.name}
        description={c.designation ?? undefined}
        actions={
          <>
            {can("leads:write") && (
              <Button size="sm" onClick={() => setNewLead(true)}>
                <Plus aria-hidden />
                New lead
              </Button>
            )}
            {can("contacts:write") && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditing(true)}
              >
                <Pencil aria-hidden />
                Edit
              </Button>
            )}
            {can("contacts:delete") && (
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
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4 pt-2">
          <div className="flex flex-wrap gap-2">
            {c.phone && (
              <Button asChild variant="secondary" size="sm">
                <a href={telHref(c.phone)}>
                  <Phone aria-hidden />
                  Call {formatPhone(c.phone)}
                </a>
              </Button>
            )}
            {(c.whatsapp || c.phone) && (
              <Button asChild variant="secondary" size="sm">
                <a
                  href={`https://wa.me/${(c.whatsapp ?? c.phone)!.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle aria-hidden />
                  WhatsApp{c.whatsapp ? ` ${formatPhone(c.whatsapp)}` : ""}
                </a>
              </Button>
            )}
            {c.email && (
              <Button asChild variant="secondary" size="sm">
                <a
                  href={`mailto:${encodeURIComponent(c.email).replace(/%40/g, "@")}`}
                >
                  <Mail aria-hidden />
                  {c.email}
                </a>
              </Button>
            )}
            <SaveContactButton
              card={{
                name: c.name,
                phone: c.phone,
                alternatePhone: c.alternate_phone,
                whatsapp: c.whatsapp,
                email: c.email,
                company: company.data?.name,
                title: c.designation,
              }}
            />
          </div>
          <dl className="divide-y divide-line text-[14px]">
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">Company</dt>
              <dd>
                {c.account_id ? (
                  <Link
                    href={`/accounts/${c.account_id}`}
                    className="hover:underline"
                  >
                    <AccountName id={c.account_id} />
                  </Link>
                ) : (
                  <span className="text-muted">Not linked</span>
                )}
              </dd>
            </div>
            {c.alternate_phone && (
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-muted">Alternate number</dt>
                <dd>
                  <a
                    href={telHref(c.alternate_phone)}
                    className="text-accent hover:underline"
                  >
                    {formatPhone(c.alternate_phone)}
                  </a>
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">Added</dt>
              <dd>{formatDate(c.created_at)}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>
      {editing && <ContactDialog contact={c} open onOpenChange={setEditing} />}
      {newLead && <NewLeadDialog contact={c} open onOpenChange={setNewLead} />}
    </>
  );
}
