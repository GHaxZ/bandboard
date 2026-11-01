import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePracticeKeyboard } from "./usePracticeKeyboard";
import { blurActiveIframe, useIframeFocusGuard } from "./useIframeFocusGuard";

const { effects } = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
}));

// Exercise the hooks' native event listeners without adding a DOM renderer.
vi.mock("react", () => ({
  useEffect: (effect: () => void | (() => void)) => effects.push(effect),
  useRef: (current: unknown) => ({ current }),
}));

let cleanups: Array<() => void>;
let page: EventTarget;
let focused: { tagName: string; isContentEditable?: boolean; blur?: () => void };
let pageHasFocus: boolean;
let bodyTabIndex: string | null;
let body: {
  tagName: string;
  getAttribute: ReturnType<typeof vi.fn>;
  setAttribute: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
};
let frames: Map<number, FrameRequestCallback>;
let nextFrameId: number;

function mountEffects() {
  for (const effect of effects.splice(0)) {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  }
}

function keyDown(key: string, properties: Partial<KeyboardEvent> = {}) {
  const event = Object.assign(new Event("keydown", { cancelable: true }), {
    key,
    ...properties,
  });
  page.dispatchEvent(event);
  return event;
}

function nextAnimationFrame() {
  const [id, callback] = frames.entries().next().value!;
  frames.delete(id);
  callback(0);
}

beforeEach(() => {
  cleanups = [];
  page = new EventTarget();
  pageHasFocus = true;
  bodyTabIndex = null;
  body = {
    tagName: "BODY",
    getAttribute: vi.fn(() => bodyTabIndex),
    setAttribute: vi.fn((_name, value: string) => { bodyTabIndex = value; }),
    removeAttribute: vi.fn(() => { bodyTabIndex = null; }),
    focus: vi.fn(() => { focused = body; }),
  };
  focused = body;
  frames = new Map();
  nextFrameId = 0;
  vi.stubGlobal("window", page);
  vi.stubGlobal("document", {
    body,
    get activeElement() { return focused; },
    hasFocus: () => pageHasFocus,
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrameId, callback);
    return nextFrameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});

afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  effects.length = 0;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("practice keyboard shortcuts", () => {
  it.each(["BUTTON", "INPUT", "TEXTAREA", "SELECT", "VIDEO", "DIV"])(
    "handles Tab and every number key while %s is focused",
    (tagName) => {
      const onToggleVideo = vi.fn();
      const onJumpToStart = vi.fn();
      const onMarkerJump = vi.fn();
      usePracticeKeyboard({ onTab: onToggleVideo, onJumpToStart, onMarkerJump });
      mountEffects();
      focused = { tagName, isContentEditable: tagName === "DIV" };

      expect(keyDown("Tab").defaultPrevented).toBe(true);
      expect(onToggleVideo).toHaveBeenCalledOnce();
      expect(keyDown("0").defaultPrevented).toBe(true);
      expect(onJumpToStart).toHaveBeenCalledOnce();
      for (let number = 1; number <= 9; number++) {
        expect(keyDown(String(number)).defaultPrevented).toBe(true);
        expect(onMarkerJump).toHaveBeenLastCalledWith(number - 1);
      }
    }
  );

  it("leaves unconfigured shortcuts and ordinary editing keys alone", () => {
    const onPlayPause = vi.fn();
    const onSeekForward = vi.fn();
    usePracticeKeyboard({ onPlayPause, onSeekForward });
    mountEffects();
    focused = { tagName: "INPUT" };

    for (const key of ["Tab", "0", "1", " ", "ArrowRight", "a"]) {
      expect(keyDown(key).defaultPrevented).toBe(false);
    }
    expect(onPlayPause).not.toHaveBeenCalled();
    expect(onSeekForward).not.toHaveBeenCalled();
  });

  it.each(["altKey", "ctrlKey", "metaKey", "isComposing"])(
    "preserves browser shortcuts and text composition with %s",
    (property) => {
      const onToggleVideo = vi.fn();
      const onJumpToStart = vi.fn();
      const onMarkerJump = vi.fn();
      usePracticeKeyboard({ onTab: onToggleVideo, onJumpToStart, onMarkerJump });
      mountEffects();

      for (const key of ["Tab", "0", "1"]) {
        expect(keyDown(key, { [property]: true }).defaultPrevented).toBe(false);
      }
      expect(onToggleVideo).not.toHaveBeenCalled();
      expect(onJumpToStart).not.toHaveBeenCalled();
      expect(onMarkerJump).not.toHaveBeenCalled();
    }
  );
});

describe("iframe focus recovery", () => {
  it("focuses the page itself and restores its original tabindex", () => {
    focused = { tagName: "IFRAME" };
    blurActiveIframe();

    expect(body.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(focused).toBe(body);
    expect(bodyTabIndex).toBeNull();

    bodyTabIndex = "0";
    focused = { tagName: "IFRAME" };
    blurActiveIframe();
    expect(bodyTabIndex).toBe("0");
  });

  it("recovers repeated or delayed iframe focus without a window blur event", () => {
    useIframeFocusGuard();
    mountEffects();
    nextAnimationFrame();
    expect(body.focus).not.toHaveBeenCalled();

    for (let click = 0; click < 3; click++) {
      focused = { tagName: "IFRAME" };
      nextAnimationFrame();
      expect(focused).toBe(body);
    }
    expect(body.focus).toHaveBeenCalledTimes(3);
  });

  it("waits for focus to settle after blur and cleans up pending work", () => {
    vi.useFakeTimers();
    useIframeFocusGuard();
    mountEffects();
    page.dispatchEvent(new Event("blur"));
    focused = { tagName: "IFRAME" };
    vi.runOnlyPendingTimers();
    expect(focused).toBe(body);

    page.dispatchEvent(new Event("blur"));
    cleanups.splice(0).forEach((cleanup) => cleanup());
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not steal focus from other apps or page controls", () => {
    useIframeFocusGuard();
    mountEffects();
    focused = { tagName: "IFRAME" };
    pageHasFocus = false;
    nextAnimationFrame();
    expect(body.focus).not.toHaveBeenCalled();

    pageHasFocus = true;
    focused = { tagName: "INPUT" };
    nextAnimationFrame();
    expect(body.focus).not.toHaveBeenCalled();
  });
});
