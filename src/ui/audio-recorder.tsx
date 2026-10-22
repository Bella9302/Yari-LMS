"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";
import { uploadFile, type UploadedFile } from "@/ui/upload-client";
import { Button } from "@/ui/button";
import { Notice } from "@/ui/primitives";

const MAX_SECONDS = 300;

// Chrome/Firefox record WebM/Opus, Safari records MP4/AAC.
function pickMime(): { recorder: string; upload: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const [recorder, upload] of [
    ["audio/webm;codecs=opus", "audio/webm"],
    ["audio/webm", "audio/webm"],
    ["audio/mp4", "audio/mp4"],
    ["audio/ogg;codecs=opus", "audio/ogg"],
  ] as const) {
    if (MediaRecorder.isTypeSupported(recorder)) return { recorder, upload };
  }
  return null;
}

/** Records a short spoken feedback note and uploads it (virus-scanned like any file). */
export function AudioRecorder({
  courseId,
  itemId,
  value,
  onChange,
}: {
  courseId: string;
  itemId: string;
  value: UploadedFile | null;
  onChange: (file: UploadedFile | null) => void;
}) {
  const [state, setState] = useState<"idle" | "recording" | "uploading">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function start() {
    setError(null);
    const mime = pickMime();
    if (!mime) return setError("This browser can't record audio. Try Chrome, Edge, Firefox or Safari.");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setError("Microphone access was blocked. Allow it in your browser to record feedback.");
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream, { mimeType: mime.recorder, audioBitsPerSecond: 32_000 });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timer.current) clearInterval(timer.current);
      setState("uploading");
      const ext = mime.upload === "audio/mp4" ? "m4a" : mime.upload === "audio/ogg" ? "ogg" : "webm";
      try {
        const file = new File(chunks, `feedback.${ext}`, { type: mime.upload });
        onChange(await uploadFile(file, { purpose: "audio", courseId, itemId, mime: mime.upload }));
      } catch (err) {
        setError((err as Error).message);
      }
      setState("idle");
    };
    recorder.current = rec;
    rec.start(1000);
    setSeconds(0);
    setState("recording");
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS && rec.state === "recording") rec.stop();
        return s + 1;
      });
    }, 1000);
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-center gap-2">
          <audio src={`/api/files/${value.id}`} controls preload="none" className="h-10 flex-1" />
          <Button variant="ghost" size="sm" onClick={() => onChange(null)} aria-label="Delete audio note">
            <Trash2 className="size-4" />
          </Button>
        </div>
      ) : state === "recording" ? (
        <Button variant="danger" onClick={() => recorder.current?.stop()}>
          <Square className="size-4" aria-hidden /> Stop · <span className="font-mono">{mmss}</span>
        </Button>
      ) : (
        <Button variant="secondary" onClick={start} disabled={state === "uploading"}>
          <Mic className="size-4" aria-hidden /> {state === "uploading" ? "Saving…" : "Record an audio note"}
        </Button>
      )}
      {state === "recording" && (
        <p className="text-muted text-xs" role="status">
          Recording — up to 5 minutes.
        </p>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}
