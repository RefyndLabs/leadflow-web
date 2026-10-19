"use client";

import * as React from "react";
import { AlertTriangle, KeyRound, Plus, Trash2 } from "lucide-react";
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "@/lib/api/hooks";
import type { ApiKeyCreated } from "@/lib/api/types";
import { formatDate, formatRelative } from "@/lib/format";
import { applyApiError, useFormBanner, useZodForm } from "@/lib/forms";
import { GRANTABLE_KEY_SCOPES, SCOPE_HELP } from "@/lib/permissions";
import { apiKeyCreate } from "@/lib/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  EmptyState,
  ErrorState,
  InlineAlert,
  RowsSkeleton,
} from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Checkbox, Input } from "@/components/ui/input";
import { Controller } from "react-hook-form";
import { PageHeader } from "./page-header";

/** Shown exactly once. Can't be dismissed by clicking outside or pressing Esc — only by the explicit button. */
function RevealDialog({
  created,
  onClose,
}: {
  created: ApiKeyCreated;
  onClose: () => void;
}) {
  const [confirmed, setConfirmed] = React.useState(false);
  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        title="Copy your new API key"
        description={`“${created.name}” — this is the only time the full key is shown.`}
        hideClose
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="space-y-4">
          <InlineAlert tone="warning" className="flex gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Copy it now and store it somewhere safe (for example n8n&apos;s
              credentials). Once you close this, it can&apos;t be shown again —
              you&apos;d have to create a new key.
            </span>
          </InlineAlert>
          <div className="space-y-2">
            <label htmlFor="new-key" className="text-[13px] font-medium">
              API key
            </label>
            <input
              id="new-key"
              readOnly
              value={created.api_key}
              onFocus={(e) => e.currentTarget.select()}
              className="h-11 w-full rounded-[10px] border border-line-strong bg-surface-2 px-3 font-mono text-[13px] sm:h-10"
            />
            <CopyButton value={created.api_key} label="Copy key" />
          </div>
          <label className="flex items-start gap-3 text-[14px]">
            <Checkbox
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            I&apos;ve copied the key and stored it safely.
          </label>
          <DialogFooter>
            <Button disabled={!confirmed} onClick={onClose}>
              Done
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (k: ApiKeyCreated) => void;
}) {
  const create = useCreateApiKey();
  const { banner, setBanner, clear } = useFormBanner();
  const form = useZodForm(apiKeyCreate, {
    name: "",
    scopes: [],
    expires_at: "",
  } as never);
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    clear();
    try {
      const created = await create.mutateAsync(
        values as Record<string, unknown>,
      );
      onOpenChange(false);
      onCreated(created);
    } catch (e) {
      setBanner(applyApiError(form as never, e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New API key"
        description="For automations such as n8n. Give it only the permissions it needs."
      >
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {banner && <InlineAlert>{banner}</InlineAlert>}
          <Field
            label="Name"
            required
            error={errors.name?.message as string | undefined}
            hint="Where it will be used, e.g. “n8n production”."
          >
            <Input maxLength={300} autoFocus {...form.register("name")} />
          </Field>
          <Controller
            control={form.control}
            name={"scopes" as never}
            render={({ field, fieldState }) => {
              const value = (field.value as string[]) ?? [];
              return (
                <fieldset className="space-y-2">
                  <legend className="mb-1 text-[13px] font-medium">
                    Permissions{" "}
                    <span className="text-muted" aria-hidden>
                      *
                    </span>
                  </legend>
                  <div className="divide-y divide-line rounded-[12px] border border-line">
                    {GRANTABLE_KEY_SCOPES.map((s) => (
                      <label
                        key={s}
                        className="flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2.5"
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={value.includes(s)}
                          onChange={(e) =>
                            field.onChange(
                              e.target.checked
                                ? [...value, s]
                                : value.filter((x) => x !== s),
                            )
                          }
                        />
                        <span className="min-w-0">
                          <span className="block font-mono text-[13px]">
                            {s}
                          </span>
                          <span className="block text-[13px] text-muted">
                            {SCOPE_HELP[s]}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {fieldState.error && (
                    <p role="alert" className="text-[13px] text-danger">
                      {fieldState.error.message}
                    </p>
                  )}
                  <p className="text-[13px] text-muted">
                    Approving, deleting, user management and settings are never
                    available to keys.
                  </p>
                </fieldset>
              );
            }}
          />
          <Field
            label="Expires on"
            hint="Leave blank for a key that doesn't expire."
            error={errors.expires_at?.message as string | undefined}
          >
            <Input
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              {...form.register("expires_at" as never)}
            />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Create key
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ApiKeys() {
  const confirm = useConfirm();
  const q = useApiKeys();
  const revoke = useRevokeApiKey();
  const [creating, setCreating] = React.useState(false);
  const [created, setCreated] = React.useState<ApiKeyCreated | null>(null);

  return (
    <>
      <PageHeader
        title="API keys"
        description="Keys let automations like n8n talk to Leadflow. Each is limited to the permissions you choose."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            New key
          </Button>
        }
      />
      <Card className="overflow-hidden">
        {q.isPending ? (
          <RowsSkeleton rows={3} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No API keys yet"
            description="Create one for n8n so it can add leads and read follow-ups."
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus aria-hidden />
                Create a key
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {q.data.items.map((k) => {
              const expired = k.expires_at
                ? new Date(k.expires_at) < new Date()
                : false;
              return (
                <li key={k.id} className="space-y-2 px-4 py-4 sm:px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
                        {k.name}
                        {!k.is_active ? (
                          <Badge tone="danger" dot>
                            Revoked
                          </Badge>
                        ) : expired ? (
                          <Badge tone="warning" dot>
                            Expired
                          </Badge>
                        ) : (
                          <Badge tone="success" dot>
                            Active
                          </Badge>
                        )}
                      </p>
                      <p className="text-[13px] text-muted">
                        <span className="font-mono">{k.key_prefix}…</span> ·
                        created {formatDate(k.created_at)} ·{" "}
                        {k.last_used_at
                          ? `last used ${formatRelative(k.last_used_at)}`
                          : "never used"}
                        {k.expires_at && (
                          <>
                            {" "}
                            · {expired ? "expired" : "expires"}{" "}
                            {formatDate(k.expires_at)}
                          </>
                        )}
                      </p>
                    </div>
                    {k.is_active && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Revoke ${k.name}`}
                        onClick={async () => {
                          if (
                            await confirm({
                              title: `Revoke “${k.name}”?`,
                              description:
                                "Anything using this key stops working immediately. This can't be undone.",
                              confirmLabel: "Revoke key",
                              destructive: true,
                            })
                          )
                            revoke.mutate(k.id);
                        }}
                      >
                        <Trash2 className="text-danger" />
                      </Button>
                    )}
                  </div>
                  <p className="flex flex-wrap gap-1">
                    {k.scopes.map((s) => (
                      <Badge key={s} className="font-mono">
                        {s}
                      </Badge>
                    ))}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {creating && (
        <CreateKeyDialog
          open
          onOpenChange={setCreating}
          onCreated={setCreated}
        />
      )}
      {created && (
        <RevealDialog created={created} onClose={() => setCreated(null)} />
      )}
    </>
  );
}
