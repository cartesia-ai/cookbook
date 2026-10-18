import { CartesiaAgentError } from '../errors';
import { Chunker, Resampler, floatToInt16, samplesForChunk } from './pcm';
import { CAPTURE_PROCESSOR_NAME, CAPTURE_WORKLET_SOURCE } from './worklet-source';

export interface CaptureOptions {
  audioContext: AudioContext;
  targetRate: number;
  chunkMs: number;
  onChunk: (pcm: Int16Array) => void;
  stream?: MediaStream;
  constraints?: MediaTrackConstraints | boolean;
}

export interface Capture {
  stop(): void;
  setMuted(muted: boolean): void;
}

export const DEFAULT_MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

export async function getMicStream(
  constraints: MediaTrackConstraints | boolean = DEFAULT_MIC_CONSTRAINTS,
): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new CartesiaAgentError(
      'mic_unavailable',
      'getUserMedia is not available. Use HTTPS or localhost.',
    );
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: constraints });
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new CartesiaAgentError('mic_denied', 'Microphone permission was denied.', {
        cause: err,
      });
    }
    throw new CartesiaAgentError('mic_unavailable', 'No usable microphone was found.', {
      cause: err,
    });
  }
}

export async function startCapture(opts: CaptureOptions): Promise<Capture> {
  const ctx = opts.audioContext;
  const stream = opts.stream ?? (await getMicStream(opts.constraints));

  const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET_SOURCE], { type: 'text/javascript' }));
  try {
    await ctx.audioWorklet.addModule(url);
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw new CartesiaAgentError(
      'worklet_failed',
      'Could not load the audio worklet. If you set a CSP, allow worker-src blob:.',
      { cause: err },
    );
  } finally {
    URL.revokeObjectURL(url);
  }

  let source: MediaStreamAudioSourceNode;
  let node: AudioWorkletNode;
  let silent: GainNode;
  try {
    source = ctx.createMediaStreamSource(stream);
    node = new AudioWorkletNode(ctx, CAPTURE_PROCESSOR_NAME);
    silent = ctx.createGain();
    silent.gain.value = 0;
    source.connect(node);
    node.connect(silent);
    silent.connect(ctx.destination);
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw new CartesiaAgentError('mic_unavailable', 'Could not connect the microphone to audio.', {
      cause: err,
    });
  }

  const resampler = new Resampler(ctx.sampleRate, opts.targetRate);
  const chunker = new Chunker(samplesForChunk(opts.targetRate, opts.chunkMs));
  let muted = false;
  let stopped = false;

  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    if (stopped) return;
    const block = muted ? new Float32Array(e.data.length) : e.data;
    const pcm = floatToInt16(resampler.process(block));
    for (const chunk of chunker.push(pcm)) opts.onChunk(chunk);
  };

  return {
    setMuted(m) {
      muted = m;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      node.port.onmessage = null;
      try {
        source.disconnect();
        node.disconnect();
        silent.disconnect();
      } catch {}
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
