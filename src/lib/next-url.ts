/** Only same-site relative paths may be used as a post-login destination (blocks open redirects). */
export function safeNext(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (!value) return fallback;
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f]/.test(value)
  )
    return fallback;
  if (value.startsWith("/login") || value.startsWith("/api")) return fallback;
  return value;
}
