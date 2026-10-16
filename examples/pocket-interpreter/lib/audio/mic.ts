const CHUNK_MS = 100;

export async function startMic(
  audioCtx: AudioContext,
  onChunk: (chunk: ArrayBuffer) => void,
  isMuted: () => boolean,
) {
  const workletSource = `
    class PCMCapture extends AudioWorkletProcessor {
      process(inputs) {
        const ch = inputs[0]?.[0];
        if (ch) this.port.postMessage(ch);
        return true;
      }
    }
    registerProcessor('pcm-capture', PCMCapture);
  `;
  const url = URL.createObjectURL(new Blob([workletSource], { type: "application/javascript" }));
  await audioCtx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const source = audioCtx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(audioCtx, "pcm-capture");

  const chunkSamples = Math.round((audioCtx.sampleRate * CHUNK_MS) / 1000);
  let pending = new Float32Array(0);
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    const joined = new Float32Array(pending.length + e.data.length);
    joined.set(pending);
    joined.set(e.data, pending.length);
    let offset = 0;
    while (joined.length - offset >= chunkSamples) {
      const chunk = isMuted() ? new Float32Array(chunkSamples) : joined.slice(offset, offset + chunkSamples);
      onChunk(chunk.buffer);
      offset += chunkSamples;
    }
    pending = joined.slice(offset);
  };
  source.connect(node);

  return {
    stop() {
      source.disconnect();
      node.disconnect();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
