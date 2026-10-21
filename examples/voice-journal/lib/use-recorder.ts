import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as React from "react";
import { MAX_RECORDING_SECONDS } from "./limits";

export function useRecorder() {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const state = useAudioRecorderState(recorder, 100);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const lock = React.useRef(false);

  const claim = React.useCallback(() => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    return true;
  }, []);
  const release = React.useCallback(() => {
    lock.current = false;
    setBusy(false);
  }, []);

  const seconds = Math.floor((state.durationMillis ?? 0) / 1000);
  const level = state.isRecording && state.metering != null ? Math.min(1, Math.max(0, (state.metering + 60) / 60)) : 0;

  const start = React.useCallback(async () => {
    if (recorder.isRecording || !claim()) return false;
    try {
      setError(null);
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError("Allow microphone access to record an entry.");
        return false;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      return true;
    } catch {
      setError("Could not start recording. Check that no other app is using the microphone.");
      return false;
    } finally {
      release();
    }
  }, [recorder, claim, release]);

  const stop = React.useCallback(async (): Promise<{ uri: string; seconds: number } | null> => {
    if (!recorder.isRecording || !claim()) return null;
    const secs = (recorder.currentTime ?? 0) || seconds;
    try {
      await recorder.stop();
      try {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      } catch {}
      const uri = recorder.uri;
      return uri ? { uri, seconds: secs } : null;
    } catch {
      setError("Could not save the recording.");
      return null;
    } finally {
      release();
    }
  }, [recorder, seconds, claim, release]);

  return { isRecording: state.isRecording, busy, seconds, level, error, start, stop, maxSeconds: MAX_RECORDING_SECONDS };
}
