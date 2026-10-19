"use client";

import * as React from "react";
import { KeyRound, LogOut, Pencil, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { users, useUserMutations } from "@/lib/api/hooks";
import type { User } from "@/lib/api/types";
import { ROLE_LABEL, USER_ROLES } from "@/lib/enums";
import { formatRelative } from "@/lib/format";
import { applyApiError, useFormBanner, useZodForm } from "@/lib/forms";
import { passwordReset, userCreate, userUpdate } from "@/lib/schemas";
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
import { Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { PAGE_SIZE, Pagination } from "@/components/ui/pagination";
import { useAuth } from "./auth";
import { PageHeader } from "./page-header";
import { FormSelect } from "./pickers";

function PasswordField({
  error,
  label = "Password",
  ...props
}: { error?: string; label?: string } & React.ComponentProps<typeof Input>) {
  return (
    <Field
      label={label}
      required
      error={error}
      hint="Share it securely; they can change it after signing in. The server enforces the strength rules."
    >
      <Input
        type="password"
        autoComplete="new-password"
        maxLength={128}
        {...props}
      />
    </Field>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const create = users.useCreate({
    handled: true,
    success: "Team member added",
  });
  const { banner, setBanner, clear } = useFormBanner();
  const form = useZodForm(userCreate, {
    name: "",
    email: "",
    role: "exec",
    division: "",
    password: "",
  } as never);
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    clear();
    try {
      await create.mutateAsync(values as Record<string, unknown>);
      form.reset();
      onOpenChange(false);
    } catch (e) {
      // 409: email already registered somewhere on this deployment; 422: password policy (message is already human-readable)
      setBanner(applyApiError(form as never, e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Add a team member"
        description="They sign in with this email and password."
      >
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {banner && <InlineAlert>{banner}</InlineAlert>}
          <Field
            label="Full name"
            required
            error={errors.name?.message as string | undefined}
          >
            <Input maxLength={300} autoFocus {...form.register("name")} />
          </Field>
          <Field
            label="Email"
            required
            error={errors.email?.message as string | undefined}
          >
            <Input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="off"
              maxLength={320}
              {...form.register("email")}
            />
          </Field>
          <FormSelect
            control={form.control as never}
            name="role"
            label="Role"
            required
            hint="Exec: day-to-day work. Manager: also approves, deletes and manages catalog. Admin: everything."
          >
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </FormSelect>
          <Field
            label="Division"
            error={errors.division?.message as string | undefined}
          >
            <Input maxLength={200} {...form.register("division")} />
          </Field>
          <PasswordField
            label="Temporary password"
            error={errors.password?.message as string | undefined}
            {...form.register("password")}
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Add member
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  user,
  open,
  onOpenChange,
}: {
  user: User;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { me } = useAuth();
  const update = users.useUpdate({ handled: true, success: "Saved" });
  const { banner, setBanner, clear } = useFormBanner();
  const form = useZodForm(userUpdate, {
    name: user.name,
    role: user.role,
    division: user.division ?? "",
    is_active: user.is_active,
  } as never);
  const { errors } = form.formState;
  const [role, active] = form.watch(["role", "is_active"]) as [string, boolean];
  const endsSessions = role !== user.role || (user.is_active && !active);

  const onSubmit = form.handleSubmit(async (values) => {
    clear();
    try {
      await update.mutateAsync({
        id: user.id,
        body: values as Record<string, unknown>,
      });
      onOpenChange(false);
    } catch (e) {
      // 409: "An organization must keep at least one active admin" — shown as written.
      setBanner(applyApiError(form as never, e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Edit ${user.name}`} description={user.email}>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {banner && <InlineAlert>{banner}</InlineAlert>}
          <Field
            label="Full name"
            required
            error={errors.name?.message as string | undefined}
          >
            <Input maxLength={300} {...form.register("name")} />
          </Field>
          <FormSelect
            control={form.control as never}
            name="role"
            label="Role"
            required
          >
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </FormSelect>
          <Field
            label="Division"
            error={errors.division?.message as string | undefined}
          >
            <Input maxLength={200} {...form.register("division")} />
          </Field>
          <label className="flex min-h-11 items-center gap-3 rounded-[10px] bg-surface-2 px-3.5 py-2.5 text-[15px]">
            <input
              type="checkbox"
              className="size-5 accent-[var(--accent)]"
              {...form.register("is_active" as never)}
            />
            <span>
              Active
              <span className="block text-[13px] text-muted">
                Inactive people can&apos;t sign in.
              </span>
            </span>
          </label>
          {user.id === me.id && (
            <InlineAlert tone="warning">
              This is you. Changing your own role or deactivating yourself will
              sign you out.
            </InlineAlert>
          )}
          {endsSessions && user.id !== me.id && (
            <InlineAlert tone="warning">
              Saving this signs them out everywhere, immediately.
            </InlineAlert>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
}: {
  user: User;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { resetPassword } = useUserMutations();
  const { banner, setBanner, clear } = useFormBanner();
  const form = useZodForm(passwordReset, { new_password: "" });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    clear();
    try {
      await resetPassword.mutateAsync({
        id: user.id,
        new_password: values.new_password,
      });
      toast.success(`Password reset for ${user.name}`);
      form.reset();
      onOpenChange(false);
    } catch (e) {
      setBanner(
        applyApiError(form as never, e, { new_password: "new_password" }),
      );
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Reset password for ${user.name}`}
        description="This also signs them out everywhere."
      >
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {banner && <InlineAlert>{banner}</InlineAlert>}
          <PasswordField
            label="New password"
            error={errors.new_password?.message as string | undefined}
            autoFocus
            {...form.register("new_password")}
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Reset password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TeamList() {
  const { me, can } = useAuth();
  const confirm = useConfirm();
  const url = useUrlState();
  const q = users.useList({ skip: url.skip, limit: PAGE_SIZE });
  const { revokeSessions } = useUserMutations();
  const [dialog, setDialog] = React.useState<
    { kind: "new" } | { kind: "edit" | "reset"; user: User } | null
  >(null);
  const canWrite = can("users:write");

  return (
    <>
      <PageHeader
        title="Team"
        description="Everyone who can sign in to your organization."
        actions={
          canWrite && (
            <Button onClick={() => setDialog({ kind: "new" })}>
              <Plus aria-hidden />
              Add member
            </Button>
          )
        }
      />
      <Card className="overflow-hidden">
        {q.isPending ? (
          <RowsSkeleton rows={5} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState icon={Users} title="No team members" />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {q.data.items.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center gap-3 px-4 py-3.5 sm:px-5"
                >
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent"
                    aria-hidden
                  >
                    {u.name
                      .split(/\s+/)
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-medium">
                      <span className="truncate">{u.name}</span>
                      {u.id === me.id && <Badge tone="accent">You</Badge>}
                      <Badge>{ROLE_LABEL[u.role]}</Badge>
                      {!u.is_active && (
                        <Badge tone="danger" dot>
                          Inactive
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-[13px] text-muted">
                      {u.email}
                      {u.division && <> · {u.division}</>}
                      <>
                        {" "}
                        ·{" "}
                        {u.last_login_at
                          ? `last seen ${formatRelative(u.last_login_at)}`
                          : "never signed in"}
                      </>
                    </p>
                  </div>
                  {canWrite && (
                    <Menu>
                      <MenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${u.name}`}
                        >
                          <Pencil />
                        </Button>
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem
                          onSelect={() => setDialog({ kind: "edit", user: u })}
                        >
                          <Pencil aria-hidden />
                          Edit
                        </MenuItem>
                        <MenuItem
                          onSelect={() => setDialog({ kind: "reset", user: u })}
                        >
                          <KeyRound aria-hidden />
                          Reset password
                        </MenuItem>
                        <MenuItem
                          destructive
                          onSelect={async () => {
                            if (
                              await confirm({
                                title: `Sign ${u.name} out everywhere?`,
                                description:
                                  "Every device they're signed in on will be signed out immediately. Use this if an account may be compromised.",
                                confirmLabel: "Sign out everywhere",
                                destructive: true,
                              })
                            )
                              revokeSessions.mutate(u.id);
                          }}
                        >
                          <LogOut aria-hidden />
                          Sign out everywhere
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  )}
                </li>
              ))}
            </ul>
            <Pagination
              skip={url.skip}
              total={q.data.total}
              count={q.data.items.length}
              onChange={(s) => url.set({ skip: s || null }, { keepSkip: true })}
              noun="people"
            />
          </>
        )}
      </Card>
      {dialog?.kind === "new" && (
        <CreateUserDialog open onOpenChange={() => setDialog(null)} />
      )}
      {dialog?.kind === "edit" && (
        <EditUserDialog
          user={dialog.user}
          open
          onOpenChange={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "reset" && (
        <ResetPasswordDialog
          user={dialog.user}
          open
          onOpenChange={() => setDialog(null)}
        />
      )}
    </>
  );
}
