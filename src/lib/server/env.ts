import "server-only";
import { z } from "zod";

const schema = z.object({
  API_URL: z
    .string()
    .url()
    .default("http://127.0.0.1:8000")
    .transform((u) => u.replace(/\/+$/, "")),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),
  SESSION_COOKIE_SECURE: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

/** Validated lazily so `next build` works without secrets present. */
export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Never echo values — only the offending keys.
    const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server environment: ${keys}`);
  }
  cached = parsed.data;
  return cached;
}

export function cookiesAreSecure(): boolean {
  const override = process.env.SESSION_COOKIE_SECURE;
  if (override === "false") return false;
  if (override === "true") return true;
  return process.env.NODE_ENV === "production";
}
