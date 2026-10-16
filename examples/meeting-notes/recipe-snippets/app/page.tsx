'use client';

import { useRef, useState } from 'react';

export default function Page() {
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [notes, setNotes] = useState<unknown>(null);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(
      t => MediaRecorder.isTypeSupported(t),
    );
    const r = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 24_000 });
    chunks.current = [];
    r.ondataavailable = e => chunks.current.push(e.data);
    r.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const type = r.mimeType;
      const ext = type.startsWith('audio/mp4') ? 'm4a' : type.startsWith('audio/ogg') ? 'ogg' : 'webm';

      const form = new FormData();
      form.append('file', new Blob(chunks.current, { type }), `meeting.${ext}`);
      const t = await fetch('/api/transcribe', { method: 'POST', body: form }).then(r => r.json());

      const n = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transcript: t.transcript }),
      }).then(r => r.json());
      setNotes(n);
    };
    r.start(1000);
    recorder.current = r;
    setRecording(true);
  }

  function stop() {
    recorder.current?.stop();
    setRecording(false);
  }

  return (
    <div>
      <button onClick={recording ? stop : start}>{recording ? 'Stop' : 'Record'}</button>
      <pre>{JSON.stringify(notes, null, 2)}</pre>
    </div>
  );
}
