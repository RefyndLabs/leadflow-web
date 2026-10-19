"use client";

import * as React from "react";
import { Camera, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { InlineAlert } from "@/components/ui/feedback";

/** Phones and tablets: their own camera app takes better photos (autofocus, flash, full resolution) than a video frame. */
function isTouchFirst(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(pointer: coarse)").matches === true
  );
}

const BLOCKED =
  "Camera access is blocked. Allow it in your browser's site settings, or choose a file instead.";
const NO_CAMERA = "No camera found on this device — choose a photo instead.";

function stop(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop()); // otherwise the camera light stays on
}

async function openStream(deviceId?: string): Promise<MediaStream> {
  const md = navigator.mediaDevices;
  const preferred: MediaStreamConstraints = {
    audio: false,
    video: deviceId
      ? {
          deviceId: { exact: deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        }
      : {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
  };
  try {
    return await md.getUserMedia(preferred);
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    // The preferred constraints can't be met: retry once with whatever camera there is.
    if (name === "NotFoundError" || name === "OverconstrainedError")
      return md.getUserMedia({ video: true, audio: false });
    throw e;
  }
}

async function videoDevices(): Promise<MediaDeviceInfo[]> {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === "videoinput",
    );
  } catch {
    return [];
  }
}

interface Session {
  stream: MediaStream;
  devices: MediaDeviceInfo[];
  activeId: string | undefined;
}

/**
 * "Take photo": on a phone, the native camera input (`capture="environment"`). On a laptop or desktop, browsers
 * ignore `capture` and show a file chooser, so instead open an in-page camera with a live preview. With no camera,
 * or permission refused, say so and point at "Choose a file".
 */
export function TakePhotoTile({
  tileClass,
  disabled,
  onPhoto,
  onNotice,
  dialogTitle = "Take a photo of the card",
  label,
}: {
  tileClass: string;
  disabled?: boolean;
  /** Receives a JPEG for the card, from either the phone camera app or the in-page camera. */
  onPhoto: (file: File) => void;
  onNotice: (message: string | null) => void;
  /** Title of the in-page camera dialog. */
  dialogTitle?: string;
  /** Accessible name, when "Take photo" alone would be ambiguous (two photo slots on one screen). */
  label?: string;
}) {
  const [touch] = React.useState(isTouchFirst);
  const [session, setSession] = React.useState<Session | null>(null);
  const live = React.useRef<MediaStream | null>(null);
  const [starting, setStarting] = React.useState(false);

  const close = React.useCallback(() => {
    stop(live.current);
    live.current = null;
    setSession(null);
  }, []);

  React.useEffect(
    () => () => {
      stop(live.current);
      live.current = null;
    },
    [],
  );

  const explain = (e: unknown) => {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError" || name === "SecurityError")
      onNotice(BLOCKED);
    else if (name === "NotReadableError")
      onNotice(
        "The camera is being used by another app. Close it, or choose a file instead.",
      );
    else onNotice(NO_CAMERA);
  };

  const open = async () => {
    onNotice(null);
    if (!navigator.mediaDevices?.getUserMedia) return onNotice(NO_CAMERA);
    setStarting(true);
    try {
      if ((await videoDevices()).length === 0) return onNotice(NO_CAMERA);
      const stream = await openStream(); // inside the click handler: the browser needs a user gesture to prompt
      live.current = stream;
      const devices = await videoDevices(); // labels and ids are only complete once permission is granted
      setSession({
        stream,
        devices,
        activeId: stream.getVideoTracks()[0]?.getSettings().deviceId,
      });
    } catch (e) {
      explain(e);
    } finally {
      setStarting(false);
    }
  };

  const switchCamera = async () => {
    if (!session || session.devices.length < 2) return;
    const i = session.devices.findIndex((d) => d.deviceId === session.activeId);
    const next = session.devices[(i + 1) % session.devices.length]!;
    stop(live.current);
    try {
      const stream = await openStream(next.deviceId);
      live.current = stream;
      setSession({ ...session, stream, activeId: next.deviceId });
    } catch (e) {
      close();
      explain(e);
    }
  };

  if (touch) {
    return (
      <label className={tileClass}>
        <Camera className="size-7 text-accent" aria-hidden />
        Take photo
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          aria-label={label}
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onPhoto(f);
          }}
        />
      </label>
    );
  }

  return (
    <>
      <button
        type="button"
        className={tileClass}
        disabled={disabled || starting}
        aria-label={label}
        onClick={() => void open()}
      >
        <Camera className="size-7 text-accent" aria-hidden />
        {starting ? "Opening camera…" : "Take photo"}
      </button>
      {session && (
        <CameraDialog
          key={session.stream.id}
          title={dialogTitle}
          stream={session.stream}
          canSwitch={session.devices.length > 1}
          onSwitch={() => void switchCamera()}
          onCancel={close}
          onCapture={(file) => {
            close();
            onPhoto(file);
          }}
        />
      )}
    </>
  );
}

function CameraDialog({
  title,
  stream,
  canSwitch,
  onSwitch,
  onCancel,
  onCapture,
}: {
  title: string;
  stream: MediaStream;
  canSwitch: boolean;
  onSwitch: () => void;
  onCancel: () => void;
  onCapture: (file: File) => void;
}) {
  const video = React.useRef<HTMLVideoElement | null>(null);
  const shutter = React.useRef<HTMLButtonElement>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  // The shutter only works once the first frame has arrived; before that there is nothing to capture.
  const [ready, setReady] = React.useState(false);
  const markReady = () => {
    if (video.current && video.current.videoWidth > 0) setReady(true);
  };
  React.useEffect(() => {
    if (ready) shutter.current?.focus(); // Enter / Space then takes the photo
  }, [ready]);

  // A callback ref, because the dialog's content mounts in a portal *after* this component's effects have run:
  // an effect would find `video.current` still empty and never attach the stream.
  const attach = React.useCallback(
    (v: HTMLVideoElement | null) => {
      video.current = v;
      if (!v) return;
      v.srcObject = stream;
      void v.play().catch(() => undefined);
    },
    [stream],
  );

  const snap = () => {
    const v = video.current;
    if (!v || !v.videoWidth)
      return setProblem(
        "The camera isn't ready yet. Give it a second and try again.",
      );
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob)
          return setProblem(
            "Couldn't take the photo. Try again, or choose a file.",
          );
        onCapture(new File([blob], "card.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent
        title={title}
        description="Hold the card flat and fill the frame."
        className="sm:max-w-2xl"
        // Focus moves to the shutter as soon as the camera is live (see the effect above).
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-3">
          <video
            ref={attach}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={markReady}
            onLoadedData={markReady}
            onPlaying={markReady}
            aria-label="Live camera preview"
            className="aspect-video w-full rounded-[12px] bg-black object-contain"
          />
          {problem && <InlineAlert tone="warning">{problem}</InlineAlert>}
          <DialogFooter className="mt-0">
            {canSwitch && (
              <Button variant="secondary" onClick={onSwitch}>
                <SwitchCamera aria-hidden />
                Switch camera
              </Button>
            )}
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button ref={shutter} onClick={snap} disabled={!ready}>
              <Camera aria-hidden />
              {ready ? "Capture" : "Starting camera…"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
