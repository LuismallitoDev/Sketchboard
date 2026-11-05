import { PERSISTED_KEYS } from "../state/appState";
import type { Store } from "../state/store";
import { parseScene, serializeScene, type ParsedScene } from "./sceneFile";

export const STORAGE_KEY = "sketchboard:scene";

export function loadLocalScene(): ParsedScene | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseScene(raw) : null;
  } catch {
    return null;
  }
}

export function clearLocalScene() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Saves the scene to localStorage shortly after it (or the view/style settings) changes. Returns a cleanup function. */
export function installAutosave(store: Store, delay = 400): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastElements = store.scene.all();
  let lastState = store.state;

  const save = () => {
    timer = undefined;
    try {
      localStorage.setItem(STORAGE_KEY, serializeScene(store.scene.all(), store.state));
    } catch {
      /* quota exceeded or storage blocked: nothing sensible to do */
    }
  };

  const unsubscribe = store.subscribe(() => {
    const els = store.scene.all();
    const s = store.state;
    const changed = els !== lastElements || PERSISTED_KEYS.some((k) => !Object.is(s[k], lastState[k]));
    lastElements = els;
    lastState = s;
    if (!changed) return;
    clearTimeout(timer);
    timer = setTimeout(save, delay);
  });

  const flush = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      save();
    }
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") flush();
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    unsubscribe();
    flush();
    window.removeEventListener("pagehide", flush);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
