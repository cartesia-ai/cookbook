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

  const seconds = Math.floor((state.durationMillis ?? 0) / 1000);
  const level = state.isRecording && state.metering != null ? Math.min(1, Math.max(0, (state.metering + 60) / 60)) : 0;

  const start = React.useCallback(async () => {
    setError(null);
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError("Allow microphone access to record an entry.");
      return false;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      return true;
    } catch {
      setError("Could not start recording. Check that no other app is using the microphone.");
      return false;
    }
  }, [recorder]);

  const stop = React.useCallback(async (): Promise<{ uri: string; seconds: number } | null> => {
    const secs = (recorder.currentTime ?? 0) || seconds;
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      setError("Could not save the recording.");
      return null;
    }
    const uri = recorder.uri;
    return uri ? { uri, seconds: secs } : null;
  }, [recorder, seconds]);

  return { isRecording: state.isRecording, seconds, level, error, start, stop, maxSeconds: MAX_RECORDING_SECONDS };
}
