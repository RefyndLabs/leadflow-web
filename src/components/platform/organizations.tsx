"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, ChevronRight, Plus } from "lucide-react";
import { ApiError, describeError } from "@/lib/api/errors";
import {
  platformApi,
  usePlatformAction,
  usePlatformOrgs,
  type PlatformOrgCreated,
} from "@/lib/api/platform";
import { formatRelative } from "@/lib/format";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  EmptyState,
  ErrorState,
  InlineAlert,
  RowsSkeleton,
} from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ShownOnce } from "./shown-once";

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function CreateOrganization({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (c: PlatformOrgCreated) => void;
}) {
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [adminName, setAdminName] = React.useState("");
  const [adminEmail, setAdminEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const create = usePlatformAction(
    (body: Record<string, string>) =>
      platformApi<PlatformOrgCreated>("/organizations", {
        method: "POST",
        body,
      }),
    {
      handled: true,
      onSuccess: (c) => {
        setName("");
        setSlug("");
        setSlugTouched(false);
        setAdminName("");
        setAdminEmail("");
        onCreated(c);
      },
    },
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    create.mutate(
      { name, slug, admin_name: adminName, admin_email: adminEmail.trim() },
      {
        onError: (err) =>
          setError(
            err instanceof ApiError && err.status === 422 && err.fields.length
              ? err.fields.map((f) => f.message).join(" ")
              : describeError(err),
          ),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New organization"
        description="A company that will use Leadflow, with its first admin."
      >
        <form onSubmit={submit} noValidate className="space-y-4 px-5 pb-5 pt-3">
          {error && <InlineAlert>{error}</InlineAlert>}
          <Field label="Company name" required>
            <Input
              maxLength={300}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          </Field>
          <Field
            label="Short name"
            required
            hint="Lowercase letters, digits and hyphens. Used by the automation and in web addresses; hard to change later."
          >
            <Input
              maxLength={64}
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
            />
          </Field>
          <Field label="First admin's name" required>
            <Input
              maxLength={300}
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
            />
          </Field>
          <Field
            label="First admin's email"
            required
            hint="They get a temporary password (shown once on the next screen) and choose their own at first sign-in."
          >
            <Input
              type="email"
              maxLength={320}
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={create.isPending}
              disabled={!name || !slug || !adminName || !adminEmail}
            >
              Create organization
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PlatformOrganizations() {
  const q = usePlatformOrgs();
  const [creating, setCreating] = React.useState(false);
  const [created, setCreated] = React.useState<PlatformOrgCreated | null>(null);

  return (
    <>
      <PageHeader
        title="Organizations"
        description="Every company using Leadflow. Only counts are shown here, never their customers' data."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            New organization
          </Button>
        }
      />
      <Card className="overflow-hidden">
        {q.isPending ? (
          <RowsSkeleton rows={3} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No organizations yet"
            description="Create the first one with “New organization”."
          />
        ) : (
          <ul className="divide-y divide-line">
            {q.data.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/platform/organizations/${o.slug}`}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
                      {o.name}
                      <span className="text-[13px] font-normal text-muted">
                        {o.slug}
                      </span>
                      {o.is_active ? (
                        <Badge tone="success">Active</Badge>
                      ) : (
                        <Badge tone="danger">Suspended</Badge>
                      )}
                      {o.integration_enabled && (
                        <Badge tone="accent">Automation on</Badge>
                      )}
                      {o.whatsapp_configured && <Badge>WhatsApp set</Badge>}
                    </p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {o.users_active} of {o.users_total} users active ·{" "}
                      {o.leads_total} leads · last sign-in{" "}
                      {o.last_login_at
                        ? formatRelative(o.last_login_at)
                        : "never"}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <CreateOrganization
        open={creating}
        onOpenChange={setCreating}
        onCreated={(c) => {
          setCreating(false);
          setCreated(c);
        }}
      />
      {created && (
        <ShownOnce
          open
          title={`${created.organization.name} is ready`}
          email={created.admin_email}
          secret={created.temporary_password}
          onClose={() => setCreated(null)}
        />
      )}
    </>
  );
}
