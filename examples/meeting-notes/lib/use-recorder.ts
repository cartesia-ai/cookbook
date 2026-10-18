"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  extensionForMime,
  MAX_RECORD_SECONDS,
  RECORD_BITS_PER_SECOND,
  RECORD_STOP_BYTES,
  RECORDER_MIME_TYPES,
} from "@/lib/limits";

export type RecorderState = "idle" | "requesting" | "recording" | "error";

export type Recording = {
  blob: Blob;
  filename: string;
  durationSec: number;
};

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return RECORDER_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

function describeError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError") return "Allow microphone access for this site in the address bar, then try again.";
  if (name === "NotFoundError") return "No microphone was found.";
  if (typeof MediaRecorder === "undefined") return "This browser cannot record audio. Upload a file instead.";
  return "Could not start the microphone.";
}

export function useRecorder(onFinish: (r: Recording) => void) {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaStream | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  const size = useRef(0);
  const discard = useRef(false);
  const mounted = useRef(false);
  const finish = useRef(onFinish);
  useEffect(() => {
    finish.current = onFinish;
  });

  const cleanup = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setMedia(null);
    void ctx.current?.close();
    ctx.current = null;
    setAudioContext(null);
  }, []);

  const stop = useCallback(() => {
    const r = recorder.current;
    if (r && r.state !== "inactive") r.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setSeconds(0);
    setBytes(0);
    setState("requesting");
    if (typeof AudioContext !== "undefined") {
      ctx.current = new AudioContext();
      void ctx.current.resume();
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("unsupported");
      }
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      setMedia(media);
      setAudioContext(ctx.current);
      const mimeType = pickMimeType();
      const r = new MediaRecorder(media, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: RECORD_BITS_PER_SECOND,
      });
      recorder.current = r;
      chunks.current = [];
      size.current = 0;
      discard.current = false;

      r.ondataavailable = (e) => {
        if (!e.data.size) return;
        chunks.current.push(e.data);
        size.current += e.data.size;
        setBytes(size.current);
        if (size.current >= RECORD_STOP_BYTES) stop();
      };
      r.onstop = () => {
        const type = r.mimeType || mimeType || "audio/webm";
        const durationSec = Math.round((Date.now() - startedAt.current) / 1000);
        const blob = new Blob(chunks.current, { type });
        cleanup();
        recorder.current = null;
        if (discard.current) return;
        setState("idle");
        finish.current({ blob, filename: `recording.${extensionForMime(type)}`, durationSec });
      };

      startedAt.current = Date.now();
      r.start(1000);
      setState("recording");
      timer.current = setInterval(() => {
        const s = Math.floor((Date.now() - startedAt.current) / 1000);
        setSeconds(s);
        if (s >= MAX_RECORD_SECONDS) stop();
      }, 250);
    } catch (err) {
      cleanup();
      setError(describeError(err));
      setState("error");
    }
  }, [cleanup, stop]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      discard.current = true;
      const r = recorder.current;
      if (r && r.state !== "inactive") r.stop();
      cleanup();
    };
  }, [cleanup]);

  return { state, seconds, bytes, error, stream: media, audioContext, start, stop };
}
