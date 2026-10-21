import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  const hooks = {
    useState: (init: unknown) => [typeof init === "function" ? (init as () => unknown)() : init, () => {}],
    useRef: (current: unknown) => ({ current }),
    useCallback: (fn: unknown) => fn,
    useEffect: (fn: () => void) => void fn(),
  };
  return { ...actual, ...hooks, default: { ...actual, ...hooks } };
});

const audio = vi.hoisted(() => ({
  recorder: {} as Record<string, unknown>,
  setAudioModeAsync: vi.fn(),
}));
vi.mock("expo-audio", () => ({
  AudioModule: { requestRecordingPermissionsAsync: async () => ({ granted: true }) },
  RecordingPresets: { HIGH_QUALITY: {} },
  setAudioModeAsync: audio.setAudioModeAsync,
  useAudioRecorder: () => audio.recorder,
  useAudioRecorderState: () => ({ isRecording: false, durationMillis: 0 }),
}));

const panel = vi.hoisted(() => ({
  rec: {} as Record<string, unknown>,
  focusEffect: null as null | (() => (() => void) | void),
  deleteRecording: vi.fn(),
}));
vi.mock("expo-router", () => ({ useFocusEffect: (fn: () => () => void) => (panel.focusEffect = fn) }));
vi.mock("react-native", () => ({ View: "View" }));
vi.mock("lucide-react-native", () => ({ Mic: "Mic", Square: "Square", X: "X" }));
vi.mock("@/components/blocks/form-section", () => ({ FormFooter: "FormFooter", FormPanel: "FormPanel", FormSection: "FormSection" }));
vi.mock("@/components/theme/theme", () => ({ useTheme: () => ({ colors: {} }) }));
vi.mock("@/components/theme/tokens", () => ({ radius: { lg: 8 } }));
vi.mock("@/components/journal/entry-list", () => ({ PRIVACY_NOTE: "note" }));
vi.mock("@/components/ui/button", () => ({ Button: "Button" }));
vi.mock("@/components/ui/text", () => ({ Text: "Text" }));
vi.mock("@/lib/audio-file", () => ({ deleteRecording: panel.deleteRecording }));
vi.mock("@/lib/use-recorder", () => ({ useRecorder: () => panel.rec }));

const { useRecorder } = await vi.importActual<typeof import("@/lib/use-recorder")>("@/lib/use-recorder");
const { RecorderPanel } = await import("@/components/journal/recorder-panel");

beforeEach(() => {
  vi.clearAllMocks();
  audio.setAudioModeAsync.mockResolvedValue(undefined);
});

describe("useRecorder.stop", () => {
  it("still returns the file when resetting the audio mode fails", async () => {
    audio.recorder = { isRecording: true, currentTime: 3, uri: "file:///rec.m4a", stop: vi.fn(async () => {}) };
    audio.setAudioModeAsync.mockRejectedValue(new Error("audio session busy"));
    expect(await useRecorder().stop()).toEqual({ uri: "file:///rec.m4a", seconds: 3 });
  });
});

type Node = { props?: { children?: unknown; onPress?: () => void } };
function findButton(node: unknown, label: string): Node | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findButton(n, label);
      if (hit) return hit;
    }
    return null;
  }
  const el = node as Node;
  if (el.props?.onPress && [el.props.children].flat().includes(label)) return el;
  return findButton(el.props?.children, label);
}

describe("RecorderPanel", () => {
  it("discards a recording whose start finished after the screen lost focus", async () => {
    let resolveStart!: (ok: boolean) => void;
    let recording = false;
    const stop = vi.fn(async () => (recording ? { uri: "file:///late.m4a", seconds: 0 } : null));
    panel.rec = {
      isRecording: false,
      busy: false,
      seconds: 0,
      level: 0,
      error: null,
      maxSeconds: 240,
      start: () =>
        new Promise<boolean>((r) => {
          resolveStart = (ok) => {
            recording = ok;
            r(ok);
          };
        }),
      stop,
    };
    const onRecorded = vi.fn();
    const tree = RecorderPanel({ busy: false, onRecorded });
    const blur = panel.focusEffect!() as () => void;

    findButton(tree, "Start recording")!.props!.onPress!();
    blur();
    expect(stop).toHaveBeenCalledTimes(1);
    resolveStart(true);
    await vi.waitFor(() => expect(panel.deleteRecording).toHaveBeenCalledWith("file:///late.m4a"));
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("keeps a recording that starts while the screen is focused", async () => {
    const stop = vi.fn();
    panel.rec = { ...panel.rec, start: async () => true, stop };
    const tree = RecorderPanel({ busy: false, onRecorded: vi.fn() });
    panel.focusEffect!();
    findButton(tree, "Start recording")!.props!.onPress!();
    await new Promise((r) => setTimeout(r, 10));
    expect(stop).not.toHaveBeenCalled();
  });
});

