"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/errors";
import { platformLocalPost } from "@/lib/api/platform";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { InlineAlert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, PasswordInput } from "@/components/ui/input";

interface Challenge {
  stage: "verify" | "setup";
  expires_in: number;
  secret: string | null;
  qr: string | null;
}

interface Verified {
  must_change_password: boolean;
  recovery_codes: string[];
}

type Step =
  | { kind: "password" }
  | { kind: "code"; challenge: Challenge; useRecovery: boolean }
  | { kind: "recovery-codes"; codes: string[] };

function messageFor(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.status === 429)
      return "Too many attempts. Wait a minute and try again.";
    if (e.status === 403) return e.detail;
    if (e.status === 404) return "The platform console is switched off.";
    if (e.code === "challenge_expired") return e.detail;
    if (e.status === 401) return fallback;
    return e.detail;
  }
  return "Something went wrong. Try again.";
}

/** Platform sign-in: password, then the authenticator code (set up on the first sign-in). */
export function PlatformLogin({ notice }: { notice: string | null }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = React.useState<Step>({ kind: "password" });
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const finish = () => {
    qc.clear();
    router.replace("/platform");
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const challenge = await platformLocalPost<Challenge>(
        "/api/platform/login",
        { email: email.trim(), password },
      );
      setPassword(""); // never kept around after it was used
      setCode("");
      setStep({ kind: "code", challenge, useRecovery: false });
    } catch (err) {
      setPassword("");
      setError(
        messageFor(err, "That email and password don't match. Try again."),
      );
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step.kind !== "code") return;
    setError(null);
    setBusy(true);
    try {
      const v = await platformLocalPost<Verified>(
        "/api/platform/verify",
        step.useRecovery ? { recovery_code: code } : { code },
      );
      if (v.recovery_codes.length > 0)
        setStep({ kind: "recovery-codes", codes: v.recovery_codes });
      else finish();
    } catch (err) {
      setCode("");
      const msg = messageFor(
        err,
        "That code isn't right. Try the current one.",
      );
      setError(msg);
      if (err instanceof ApiError && err.code === "challenge_expired")
        setStep({ kind: "password" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {notice && step.kind === "password" && (
        <InlineAlert tone="accent">{notice}</InlineAlert>
      )}
      {error && <InlineAlert>{error}</InlineAlert>}

      {step.kind === "password" && (
        <form onSubmit={submitPassword} noValidate className="space-y-4">
          <Field label="Email" required>
            <Input
              type="email"
              autoComplete="username"
              maxLength={320}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Password" required>
            <PasswordInput
              autoComplete="current-password"
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={busy}
            disabled={!email || !password}
          >
            Continue
          </Button>
        </form>
      )}

      {step.kind === "code" && (
        <form onSubmit={submitCode} noValidate className="space-y-4">
          {step.challenge.stage === "setup" ? (
            <div className="space-y-3 text-[14px]">
              <p>
                <strong>Set up two-step sign-in.</strong> Open an authenticator
                app on your phone (Google Authenticator, Microsoft
                Authenticator, 1Password…), add an account and scan this code.
              </p>
              {step.challenge.qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={step.challenge.qr}
                  alt="QR code to add Leadflow Platform to your authenticator app"
                  width={220}
                  height={220}
                  className="mx-auto rounded-[10px] bg-white p-2"
                />
              )}
              {step.challenge.secret && (
                <div className="rounded-[10px] bg-surface-2 p-3">
                  <p className="text-[13px] text-muted">
                    Can&apos;t scan? Type this key instead:
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <code className="break-all font-mono text-[14px]">
                      {step.challenge.secret}
                    </code>
                    <CopyButton value={step.challenge.secret} />
                  </div>
                </div>
              )}
              <p>Then type the 6-digit code the app shows.</p>
            </div>
          ) : (
            <p className="text-[14px]">
              {step.useRecovery
                ? "Type one of the recovery codes you saved when you set up two-step sign-in. Each works once."
                : "Open your authenticator app and type the 6-digit code for Leadflow Platform."}
            </p>
          )}
          <Field
            label={step.useRecovery ? "Recovery code" : "6-digit code"}
            required
          >
            <Input
              inputMode={step.useRecovery ? "text" : "numeric"}
              autoComplete="one-time-code"
              maxLength={step.useRecovery ? 40 : 10}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
          </Field>
          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={busy}
            disabled={!code.trim()}
          >
            Sign in
          </Button>
          <div className="flex justify-between gap-2 text-[14px]">
            <Button
              type="button"
              variant="link"
              onClick={() => {
                setStep({ kind: "password" });
                setError(null);
              }}
            >
              Start again
            </Button>
            {step.challenge.stage === "verify" && (
              <Button
                type="button"
                variant="link"
                onClick={() => {
                  setCode("");
                  setError(null);
                  setStep({ ...step, useRecovery: !step.useRecovery });
                }}
              >
                {step.useRecovery
                  ? "Use the authenticator app"
                  : "Lost your phone? Use a recovery code"}
              </Button>
            )}
          </div>
        </form>
      )}

      {step.kind === "recovery-codes" && (
        <div className="space-y-4 text-[14px]">
          <InlineAlert tone="success">Two-step sign-in is on.</InlineAlert>
          <p>
            <strong>Save these recovery codes</strong> somewhere safe (a
            password manager). If you lose your phone, each one lets you sign in
            once. They are not shown again.
          </p>
          <ul className="grid grid-cols-2 gap-2 rounded-[10px] bg-surface-2 p-3 font-mono text-[14px]">
            {step.codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <CopyButton value={step.codes.join("\n")} label="Copy all codes" />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
            />
            I have saved my recovery codes
          </label>
          <Button
            size="lg"
            className="w-full"
            disabled={!saved}
            onClick={finish}
          >
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}
