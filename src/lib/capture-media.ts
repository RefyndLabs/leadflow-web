import { redirectToLogin } from "./api/client";
import { ApiError, parseErrorBody } from "./api/errors";
import type { Capture } from "./api/types";

/** "card" is the front of the business card; "card-back" the optional back. */
export type CaptureFileKind = "card" | "card-back" | "voice";

/**
 * Uploads one file to our own server route, which streams it to the API. Uses XMLHttpRequest because
 * `fetch` cannot report upload progress. The body is `FormData` — the browser adds the multipart
 * boundary, so the Content-Type header must NOT be set by hand.
 */
export function uploadCaptureFile(
  captureId: string,
  kind: CaptureFileKind,
  blob: Blob,
  filename: string,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<Capture> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", blob, filename);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/captures/${captureId}/${kind}`);
    xhr.setRequestHeader("x-lf-csrf", "1");
    xhr.setRequestHeader("accept", "application/json");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) =>
      e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onerror = () =>
      reject(
        new ApiError({
          status: 0,
          detail:
            "Couldn't reach the server. Check your connection and tap Retry.",
          code: "network",
        }),
      );
    xhr.ontimeout = xhr.onerror;
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error body */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        return resolve(body as Capture);
      }
      const headers = new Headers();
      const retry = xhr.getResponseHeader("retry-after");
      if (retry) headers.set("retry-after", retry);
      if (xhr.status === 401) redirectToLogin("expired");
      reject(parseErrorBody(xhr.status, body, headers));
    };
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}

const MAX_SIDE = 2560;

/**
 * Optional downscale before upload to save mobile data: longest side 2560 px, JPEG ~0.85. Orientation is baked in
 * by the decoder here; when we skip the resize the original goes up untouched (the API fixes rotation and strips
 * EXIF itself). Anything the browser can't decode (e.g. HEIC outside Safari) is sent as-is so the API can answer.
 */
export async function prepareCardImage(file: Blob): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== "function") return file;
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const fine =
      scale === 1 &&
      file.size <= 2.5 * 1024 * 1024 &&
      /^image\/(jpeg|png|webp)$/.test(file.type);
    if (fine) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const out = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", 0.85),
    );
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

/** Best supported recording format for this browser: Chrome/Edge webm, Firefox ogg, Safari mp4. Never hard-coded. */
export function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find(
    (t) => MediaRecorder.isTypeSupported(t),
  );
}

/** Extracted phones can hold two numbers ("98765 43210 / 022 1234 5678"). Returns each plausible number. */
export function splitPhones(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\s*(?:\/|;|,|\bor\b|\band\b|\n)\s*/i)
    .map((p) => p.trim())
    .filter((p) => p.replace(/\D/g, "").length >= 6);
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}
