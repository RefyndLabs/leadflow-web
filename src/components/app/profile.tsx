"use client";

import * as React from "react";
import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { ROLE_LABEL } from "@/lib/enums";
import { applyApiError, useFormBanner, useZodForm } from "@/lib/forms";
import { changePasswordPayload } from "@/lib/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { InlineAlert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useAuth } from "./auth";
import { PageHeader } from "./page-header";

type Theme = "system" | "light" | "dark";

function readTheme(): Theme {
  try {
    const t = localStorage.getItem("lf-theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function Appearance() {
  const [theme, setTheme] = React.useState<Theme>(() =>
    typeof window === "undefined" ? "system" : readTheme(),
  );

  const choose = (t: Theme) => {
    setTheme(t);
    try {
      if (t === "system") localStorage.removeItem("lf-theme");
      else localStorage.setItem("lf-theme", t);
    } catch {
      /* storage blocked: the choice still applies until reload */
    }
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        <Segmented<Theme>
          label="Appearance"
          value={theme}
          onValueChange={choose}
          options={[
            {
              value: "system",
              label: "Match device",
              icon: <Monitor className="size-4" aria-hidden />,
            },
            {
              value: "light",
              label: "Light",
              icon: <Sun className="size-4" aria-hidden />,
            },
            {
              value: "dark",
              label: "Dark",
              icon: <Moon className="size-4" aria-hidden />,
            },
          ]}
        />
        <p className="text-[13px] text-muted">Saved on this device only.</p>
      </CardBody>
    </Card>
  );
}

export function ChangePassword({ onChanged }: { onChanged?: () => void } = {}) {
  const { banner, setBanner, clear } = useFormBanner();
  const [confirmValue, setConfirmValue] = React.useState("");
  const [mismatch, setMismatch] = React.useState(false);
  const form = useZodForm(changePasswordPayload, {
    current_password: "",
    new_password: "",
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    clear();
    if (values.new_password !== confirmValue) return setMismatch(true);
    setMismatch(false);
    try {
      await api<void>("/auth/change-password", {
        method: "POST",
        body: values,
      });
      toast.success("Password changed");
      form.reset();
      setConfirmValue("");
      onChanged?.();
    } catch (e) {
      // 400 = wrong current password; 422 = policy, with a human-readable reason — shown as written.
      setBanner(applyApiError(form as never, e));
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {banner && <InlineAlert>{banner}</InlineAlert>}
          <Field
            label="Current password"
            required
            error={errors.current_password?.message as string | undefined}
          >
            <Input
              type="password"
              autoComplete="current-password"
              maxLength={128}
              {...form.register("current_password")}
            />
          </Field>
          <Field
            label="New password"
            required
            error={errors.new_password?.message as string | undefined}
            hint="At least 12 characters, not a common password, and not containing your name or email."
          >
            <Input
              type="password"
              autoComplete="new-password"
              maxLength={128}
              {...form.register("new_password")}
            />
          </Field>
          <Field
            label="Confirm new password"
            required
            error={mismatch ? "The passwords don't match" : undefined}
          >
            <Input
              type="password"
              autoComplete="new-password"
              maxLength={128}
              value={confirmValue}
              onChange={(e) => {
                setConfirmValue(e.target.value);
                setMismatch(false);
              }}
            />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={form.formState.isSubmitting}>
              Change password
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function Profile() {
  const { me, signOut } = useAuth();
  const confirm = useConfirm();
  const [showPerms, setShowPerms] = React.useState(false);

  return (
    <>
      <PageHeader
        title="Profile & security"
        description={`${me.name} · ${me.organization.name}`}
      />
      <div className="grid max-w-3xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle>You</CardTitle>
          </CardHeader>
          <CardBody className="pt-2">
            <dl className="divide-y divide-line text-[14px]">
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-muted">Name</dt>
                <dd>{me.name}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-muted">Email</dt>
                <dd className="truncate">{me.email}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-muted">Role</dt>
                <dd>
                  <Badge>{ROLE_LABEL[me.role]}</Badge>
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-muted">Division</dt>
                <dd>{me.division ?? "—"}</dd>
              </div>
            </dl>
            <div className="mt-3">
              <Button
                variant="link"
                onClick={() => setShowPerms((v) => !v)}
                aria-expanded={showPerms}
              >
                {showPerms ? "Hide" : "Show"} what I can do (
                {me.permissions.length} permissions)
              </Button>
              {showPerms && (
                <p className="mt-2 flex flex-wrap gap-1">
                  {me.permissions
                    .slice()
                    .sort()
                    .map((p) => (
                      <Badge key={p} className="font-mono">
                        {p}
                      </Badge>
                    ))}
                </p>
              )}
            </div>
          </CardBody>
        </Card>

        <Appearance />

        <ChangePassword />

        <Card>
          <CardHeader>
            <CardTitle>Sessions</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-[14px] text-muted">
              Signed in somewhere you don&apos;t recognise, or lost a device?
              Sign out of every device at once.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void signOut()}>
                <LogOut aria-hidden />
                Sign out
              </Button>
              <Button
                variant="danger-tint"
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Sign out everywhere?",
                      description:
                        "Every device you're signed in on, including this one, will be signed out.",
                      confirmLabel: "Sign out everywhere",
                      destructive: true,
                    })
                  )
                    await signOut(true);
                }}
              >
                Sign out everywhere
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
