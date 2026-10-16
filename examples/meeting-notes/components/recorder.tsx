"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle, Mic, Square } from "lucide-react";
import { Field, FieldGrid } from "@/components/blocks/field";
import { FileDropzone } from "@/components/blocks/file-dropzone";
import { FormFooter, FormPanel, FormSection } from "@/components/blocks/form-section";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LanguageSelect } from "@/components/language-select";
import { LevelMeter } from "@/components/level-meter";
import { formatBytes, formatDuration } from "@/lib/format";
import { AUDIO_EXTENSIONS, DEFAULT_LANGUAGE, MAX_AUDIO_BYTES, MAX_RECORD_SECONDS, RECORD_STOP_BYTES } from "@/lib/limits";
import { startMeeting } from "@/lib/pipeline";
import { useRecorder, type Recording } from "@/lib/use-recorder";

const ACCEPT = AUDIO_EXTENSIONS.map((e) => `.${e}`).join(",");

export function Recorder() {
  const router = useRouter();
  const [mode, setMode] = useState<"record" | "upload">("record");
  const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE);
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(blob: Blob, filename: string, durationSec?: number) {
    setNotice(null);
    if (blob.size > MAX_AUDIO_BYTES) {
      setNotice("File too large for the hosted limit (4 MB). Run locally or see the README for large files.");
      return;
    }
    if (blob.size === 0) {
      setNotice("The recording is empty.");
      return;
    }
    setSending(true);
    const id = await startMeeting(blob, filename, language, durationSec);
    router.push(`/meeting/${id}`);
  }

  const rec = useRecorder((r: Recording) => void submit(r.blob, r.filename, r.durationSec));
  const recording = rec.state === "recording";
  const requesting = rec.state === "requesting";
  const busy = requesting || recording || sending;
  const error = notice ?? (mode === "record" ? rec.error : null);

  return (
    <FormPanel>
      <FormSection
        title="New meeting"
        description="Audio goes to Cartesia and is not kept."
        aside={
          <Tabs value={mode} onValueChange={(v) => setMode(v as "record" | "upload")}>
            <TabsList>
              <TabsTrigger value="record" disabled={busy}>
                Record
              </TabsTrigger>
              <TabsTrigger value="upload" disabled={busy}>
                Upload
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      >
        {mode === "record" ? (
          recording ? (
            <div
              className="flex h-36 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-muted/40 px-4"
              role="status"
              aria-live="off"
            >
              <div className="flex items-center gap-2.5">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-60" aria-hidden />
                  <span className="relative inline-flex size-2.5 rounded-full bg-destructive" aria-hidden />
                </span>
                <span className="sr-only">Recording,</span>
                <span className="text-[1.75rem] leading-8 font-semibold tabular-nums">{formatDuration(rec.seconds)}</span>
              </div>
              <LevelMeter stream={rec.stream} audioContext={rec.audioContext} />
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatBytes(rec.bytes)} of {formatBytes(RECORD_STOP_BYTES)} · stops at {formatDuration(MAX_RECORD_SECONDS)}
              </span>
            </div>
          ) : (
            <div className="flex h-36 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-input bg-background px-4 text-center">
              <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Mic className="size-4" aria-hidden />
              </span>
              <span className="flex flex-col gap-1">
                <span className="text-sm">Start recording when the meeting begins</span>
                <span className="text-xs text-muted-foreground">
                  Up to {MAX_RECORD_SECONDS / 60} minutes. Stop to get the notes.
                </span>
              </span>
            </div>
          )
        ) : (
          <FileDropzone
            id="audio-file"
            accept={ACCEPT}
            file={file}
            onFileChange={(f) => {
              setNotice(null);
              setFile(f);
            }}
            hint="MP3, M4A, WAV, WebM or FLAC, up to 4 MB"
            maxBytes={MAX_AUDIO_BYTES}
            disabled={busy}
          />
        )}

        <FieldGrid>
          <Field label="Spoken language" htmlFor="language">
            <LanguageSelect id="language" value={language} onValueChange={setLanguage} disabled={busy} />
          </Field>
        </FieldGrid>

        {error && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden />
            <AlertTitle>{mode === "record" && !notice ? "Could not start recording" : "Could not use this audio"}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FormSection>

      <FormFooter>
        {mode === "upload" ? (
          <Button className="sm:min-w-40" disabled={!file || busy} onClick={() => file && void submit(file, file.name)}>
            {sending && <LoaderCircle className="animate-spin" aria-hidden />}
            Write notes
          </Button>
        ) : recording ? (
          <Button className="sm:min-w-40" onClick={rec.stop}>
            <Square className="fill-current" aria-hidden />
            Stop and write notes
          </Button>
        ) : (
          <Button className="sm:min-w-40" onClick={rec.start} disabled={requesting || sending}>
            {requesting || sending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Mic aria-hidden />}
            {requesting ? "Waiting for the microphone" : "Start recording"}
          </Button>
        )}
      </FormFooter>
    </FormPanel>
  );
}
