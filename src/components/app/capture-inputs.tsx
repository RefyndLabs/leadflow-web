"use client";

import * as React from "react";
import {
  ImagePlus,
  Mic,
  RotateCcw,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/feedback";
import {
  formatBytes,
  formatDuration,
  pickRecorderMime,
  prepareCardImage,
} from "@/lib/capture-media";
import { cn } from "@/lib/utils";
import { AudioPlayer, ZoomableImage } from "./attachments";
import { TakePhotoTile } from "./camera-dialog";

/** A captured blob plus the object URL used to preview it. Whoever replaces or drops one revokes the URL. */
export interface Picked {
  blob: Blob;
  url: string;
}

export const pick = (blob: Blob): Picked => ({
  blob,
  url: URL.createObjectURL(blob),
});
export const release = (p: Picked | null) => p && URL.revokeObjectURL(p.url);

const MAX_PHOTO = 16 * 1024 * 1024;
const MAX_AUDIO = 16 * 1024 * 1024;

/* ── Business card ─────────────────────────────────────────────────────── */
export type CardSide = "front" | "back";

const SIDE_TEXT: Record<
  CardSide,
  { alt: string; title: string; camera: string; choose: string | undefined }
> = {
  front: {
    alt: "Business card you captured",
    title: "Business card",
    camera: "Take a photo of the card",
    choose: undefined,
  },
  back: {
    alt: "Back of the business card you captured",
    title: "Back of the card",
    camera: "Take a photo of the back of the card",
    choose: "Choose a file for the back of the card",
  },
};

/**
 * The two ways to add a card photo: Take photo and Choose a file. Checks the file and downsizes it,
 * then hands over a ready-to-upload image. Used for both sides of the card.
 */
export function PhotoInput({
  side = "front",
  onPhoto,
  disabled,
  compact,
}: {
  side?: CardSide;
  onPhoto: (photo: Blob) => void;
  disabled?: boolean;
  /** Smaller tiles, for a side panel. */
  compact?: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const text = SIDE_TEXT[side];

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/"))
      return setError("That isn't a photo. Choose a JPEG, PNG or WebP image.");
    if (
      /image\/(heic|heif)/i.test(file.type) ||
      /\.(heic|heif)$/i.test(file.name)
    ) {
      // Safari converts HEIC to JPEG when the input lists JPEG; if one still gets here the API would refuse it.
      return setError(
        "HEIC photos aren't supported. Use Take photo, or choose a JPEG, PNG or WebP image.",
      );
    }
    setBusy(true);
    try {
      const prepared = await prepareCardImage(file);
      if (prepared.size > MAX_PHOTO)
        return setError(
          "That photo is over 16 MB. Retake it at a lower resolution.",
        );
      onPhoto(prepared);
    } finally {
      setBusy(false);
    }
  };

  const tile = cn(
    "flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-line-strong px-4 text-center text-[15px] font-medium transition-colors hover:border-accent hover:bg-accent-soft focus-within:border-accent has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
    compact ? "min-h-20 py-3" : "min-h-28 py-5",
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Phones: native camera app. Laptops: an in-page camera dialog (browsers ignore `capture` on desktop). */}
        <TakePhotoTile
          tileClass={tile}
          disabled={disabled || busy}
          onPhoto={(f) => void onFile(f)}
          onNotice={setError}
          dialogTitle={text.camera}
          label={side === "back" ? text.camera : undefined}
        />
        <label className={tile}>
          <ImagePlus className="size-7 text-muted" aria-hidden />
          Choose a file
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label={text.choose}
            disabled={disabled || busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              void onFile(f);
            }}
          />
        </label>
      </div>
      {busy && (
        <p role="status" className="text-[13px] text-muted">
          Preparing photo…
        </p>
      )}
      {error && <InlineAlert>{error}</InlineAlert>}
    </div>
  );
}

export function CardPicker({
  value,
  onChange,
  disabled,
  side = "front",
  onRemove,
}: {
  value: Picked | null;
  onChange: (p: Picked | null) => void;
  disabled?: boolean;
  side?: CardSide;
  /** Offers Remove next to Retake (the optional back of the card). */
  onRemove?: () => void;
}) {
  const text = SIDE_TEXT[side];
  if (value) {
    return (
      <div className="space-y-3">
        <ZoomableImage
          src={value.url}
          alt={text.alt}
          title={text.title}
          className="h-56 w-full sm:h-64"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-muted">
            {formatBytes(value.blob.size)}
          </p>
          <div className="flex flex-wrap gap-2">
            {onRemove && (
              <Button
                variant="danger-tint"
                size="sm"
                disabled={disabled}
                aria-label={side === "back" ? "Remove the back of the card" : undefined}
                onClick={() => {
                  release(value);
                  onRemove();
                }}
              >
                <Trash2 aria-hidden />
                Remove
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              aria-label={side === "back" ? "Retake the back of the card" : undefined}
              onClick={() => {
                release(value);
                onChange(null);
              }}
            >
              <RotateCcw aria-hidden />
              Retake
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PhotoInput
      side={side}
      disabled={disabled}
      onPhoto={(photo) => {
        release(value);
        onChange(pick(photo));
      }}
    />
  );
}

/* ── Voice note ────────────────────────────────────────────────────────── */
const MAX_RECORD_S = 180;

export function VoiceRecorder({
  value,
  onChange,
  disabled,
}: {
  value: Picked | null;
  onChange: (p: Picked | null) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = React.useState(false);
  const [seconds, setSeconds] = React.useState(0);
  const [notice, setNotice] = React.useState<{
    tone: "danger" | "warning";
    text: string;
  } | null>(null);
  const recorder = React.useRef<MediaRecorder | null>(null);
  const stream = React.useRef<MediaStream | null>(null);
  const timer = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const wake = React.useRef<WakeLockSentinel | null>(null);
  const supported =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  const cleanup = React.useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop()); // turns the browser's recording indicator off
    stream.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    void wake.current?.release().catch(() => undefined);
    wake.current = null;
  }, []);

  // Stop everything if the screen is left mid-recording.
  React.useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
      cleanup();
    },
    [cleanup],
  );

  // Mobile browsers may stop a recording when the tab is hidden: say so rather than losing it silently.
  React.useEffect(() => {
    if (!recording) return;
    const onHide = () =>
      document.hidden &&
      setNotice({
        tone: "warning",
        text: "Keep this screen open while recording — the phone may stop it otherwise.",
      });
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [recording]);

  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  };

  const start = async () => {
    setNotice(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const mime = pickRecorderMime();
      const rec = new MediaRecorder(
        media,
        mime ? { mimeType: mime } : undefined,
      );
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        cleanup();
        setRecording(false);
        if (chunks.length) {
          release(value);
          onChange(
            pick(
              new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" }),
            ),
          ); // keep the type the browser chose
        }
      };
      rec.start();
      recorder.current = rec;
      setSeconds(0);
      setRecording(true);
      try {
        wake.current = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        /* wake lock is a nicety */
      }
      timer.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_RECORD_S && rec.state === "recording") {
            rec.stop();
            setNotice({
              tone: "warning",
              text: "Stopped at 3 minutes. Record another note if you need more.",
            });
          }
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      cleanup();
      const name = e instanceof DOMException ? e.name : "";
      setNotice({
        tone: "danger",
        text:
          name === "NotAllowedError" || name === "SecurityError"
            ? "Microphone access is blocked. Allow it in your browser's site settings, then tap the mic again — or attach a recording instead."
            : name === "NotFoundError"
              ? "No microphone was found on this device. You can attach a recording instead."
              : "Couldn't start the microphone. You can attach a recording instead.",
      });
    }
  };

  const onAttach = (file: File | undefined) => {
    if (!file) return;
    setNotice(null);
    if (file.size > MAX_AUDIO)
      return setNotice({
        tone: "danger",
        text: "That recording is over 16 MB.",
      });
    if (
      !file.type.startsWith("audio/") &&
      !/\.(m4a|mp3|wav|ogg|webm|aac|flac|mp4)$/i.test(file.name)
    ) {
      return setNotice({ tone: "danger", text: "That isn't an audio file." });
    }
    release(value);
    onChange(pick(file));
  };

  if (value && !recording) {
    return (
      <div className="space-y-3">
        <AudioPlayer src={value.url} label="Your recording" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-muted">
            {formatBytes(value.blob.size)}
          </p>
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => {
              release(value);
              onChange(null);
            }}
          >
            <RotateCcw aria-hidden />
            Re-record
          </Button>
        </div>
        {notice && <InlineAlert tone={notice.tone}>{notice.text}</InlineAlert>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {supported ? (
        <div className="flex flex-col items-center gap-3 rounded-[14px] bg-surface-2 px-4 py-6">
          <button
            type="button"
            onClick={recording ? stop : () => void start()}
            disabled={disabled}
            aria-pressed={recording}
            aria-label={
              recording ? "Stop recording" : "Start recording a voice note"
            }
            className={cn(
              "relative grid size-24 place-items-center rounded-full text-white shadow-sm transition-transform active:scale-95 disabled:opacity-50",
              recording
                ? "bg-danger text-accent-fg"
                : "bg-accent text-accent-fg",
            )}
          >
            {recording && (
              <span
                aria-hidden
                className="absolute inset-0 animate-ping rounded-full bg-danger opacity-40"
              />
            )}
            {recording ? (
              <Square className="relative size-9 fill-current" aria-hidden />
            ) : (
              <Mic className="relative size-10" aria-hidden />
            )}
          </button>
          {recording ? (
            <p
              role="timer"
              aria-label="Recording time"
              className="text-[22px] font-semibold tabular text-danger"
            >
              {formatDuration(seconds)}
            </p>
          ) : (
            <p className="text-[15px] font-medium">Tap, then speak</p>
          )}
          <p className="text-[13px] text-muted">
            {recording
              ? `Tap to stop · stops by itself at ${MAX_RECORD_S / 60} minutes`
              : "What does this person want? Say it in any language."}
          </p>
        </div>
      ) : (
        <InlineAlert tone="warning">
          This browser can&apos;t record audio. Attach a recording instead — on
          a phone, the file chooser offers to record one.
        </InlineAlert>
      )}
      {!recording && (
        <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-[10px] bg-surface-2 px-4 text-[14px] font-medium hover:bg-line has-[:disabled]:opacity-50 sm:h-9">
          <Upload className="size-[18px]" aria-hidden />
          Attach a recording instead
          <input
            type="file"
            accept="audio/*"
            className="sr-only"
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              onAttach(f);
            }}
          />
        </label>
      )}
      {notice && <InlineAlert tone={notice.tone}>{notice.text}</InlineAlert>}
    </div>
  );
}
