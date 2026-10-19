"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/errors";
import { localPost } from "@/lib/api/client";
import { keys } from "@/lib/api/hooks";
import type { Me } from "@/lib/api/types";
import { useZodForm } from "@/lib/forms";
import { loginPayload } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, PasswordInput } from "@/components/ui/input";
import { InlineAlert } from "@/components/ui/feedback";

export function LoginForm({
  next,
  notice,
}: {
  next: string;
  notice: string | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const form = useZodForm(loginPayload, { email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [waitFor, setWaitFor] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Rate-limited (429): disable the button and count down instead of inviting more attempts.
  useEffect(() => {
    if (waitFor <= 0) return;
    const t = setTimeout(() => setWaitFor((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [waitFor]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    setSubmitting(true);
    try {
      const me = await localPost<Me>("/api/auth/login", values);
      qc.setQueryData(keys.me, me);
      form.reset({ email: "", password: "" }); // never keep the password around
      router.replace(next);
    } catch (e) {
      form.resetField("password");
      if (e instanceof ApiError && e.status === 401) {
        setError(
          "That email and password don't match. Check them and try again.",
        );
      } else if (e instanceof ApiError && e.status === 429) {
        const secs = e.retryAfter ?? 30;
        setWaitFor(secs);
        setError("Too many attempts. Wait a moment before trying again.");
      } else if (e instanceof ApiError && e.status === 422) {
        setError("Enter a valid email address and your password.");
      } else {
        setError(
          e instanceof ApiError ? e.detail : "Something went wrong. Try again.",
        );
      }
      form.setFocus("password");
    } finally {
      setSubmitting(false);
    }
  });

  const { errors } = form.formState;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="space-y-4 rounded-[16px] border border-line bg-surface p-5 sm:p-6"
    >
      {notice && !error && <InlineAlert tone="accent">{notice}</InlineAlert>}
      {error && <InlineAlert>{error}</InlineAlert>}

      <Field
        label="Email"
        required
        error={errors.email?.message as string | undefined}
      >
        <Input
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          placeholder="you@company.com"
          {...form.register("email")}
        />
      </Field>

      <Field
        label="Password"
        required
        error={errors.password?.message as string | undefined}
      >
        <PasswordInput
          autoComplete="current-password"
          {...form.register("password")}
        />
      </Field>

      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={submitting}
        disabled={waitFor > 0}
      >
        {waitFor > 0 ? `Try again in ${waitFor}s` : "Sign in"}
      </Button>
    </form>
  );
}
