/** A field-level problem reported by the API (FastAPI's 422 shape). */
export interface FieldIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly fields: FieldIssue[];
  readonly requestId: string | null;
  readonly retryAfter: number | null;
  readonly code: string | null;

  constructor(init: {
    status: number;
    detail: string;
    fields?: FieldIssue[];
    requestId?: string | null;
    retryAfter?: number | null;
    code?: string | null;
  }) {
    super(init.detail);
    this.name = "ApiError";
    this.status = init.status;
    this.detail = init.detail;
    this.fields = init.fields ?? [];
    this.requestId = init.requestId ?? null;
    this.retryAfter = init.retryAfter ?? null;
    this.code = init.code ?? null;
  }
}

interface RawIssue {
  loc?: unknown[];
  msg?: string;
}

/** FastAPI returns `detail` either as a string or as an array of validation issues — handle both. */
export function parseErrorBody(
  status: number,
  body: unknown,
  headers: Headers,
): ApiError {
  const requestId =
    (body &&
    typeof body === "object" &&
    "request_id" in body &&
    typeof (body as { request_id: unknown }).request_id === "string"
      ? (body as { request_id: string }).request_id
      : null) ?? headers.get("x-request-id");
  const retry = Number(headers.get("retry-after"));
  const retryAfter = Number.isFinite(retry) && retry > 0 ? retry : null;
  const code =
    body &&
    typeof body === "object" &&
    typeof (body as { code?: unknown }).code === "string"
      ? (body as { code: string }).code
      : null;

  let detail = "";
  let fields: FieldIssue[] = [];
  const raw =
    body && typeof body === "object"
      ? (body as { detail?: unknown }).detail
      : undefined;
  if (typeof raw === "string") {
    detail = raw;
  } else if (Array.isArray(raw)) {
    fields = (raw as RawIssue[]).map((i) => ({
      path: (i.loc ?? [])
        .filter((p) => p !== "body" && p !== "query")
        .join("."),
      message: cleanMessage(i.msg ?? "Invalid value"),
    }));
    detail =
      fields.length === 1 && !fields[0]!.path
        ? fields[0]!.message
        : "Some fields need attention.";
  }

  return new ApiError({
    status,
    detail: detail || defaultMessage(status),
    fields,
    requestId,
    retryAfter,
    code,
  });
}

function cleanMessage(msg: string): string {
  return msg.replace(/^Value error, /, "");
}

export function defaultMessage(status: number): string {
  switch (status) {
    case 401:
      return "Your session has expired. Sign in again.";
    case 403:
      return "You don't have permission to do that.";
    case 404:
      return "That record doesn't exist or you can't see it.";
    case 409:
      return "That conflicts with the current state of the record.";
    case 422:
      return "Some fields need attention.";
    case 429:
      return "Too many requests. Wait a moment, then try again.";
    default:
      return status >= 500
        ? "Something went wrong on our side. Try again in a moment."
        : "The request could not be completed.";
  }
}

/** Human message for toasts and inline banners. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429 && err.retryAfter)
      return `Too many requests. Try again in ${err.retryAfter}s.`;
    if (err.status >= 500 && err.requestId)
      return `${err.detail} (ref ${err.requestId})`;
    return err.detail;
  }
  if (err instanceof DOMException && err.name === "AbortError")
    return "The request was cancelled.";
  return "Something went wrong. Check your connection and try again.";
}
