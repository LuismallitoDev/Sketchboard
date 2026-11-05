import "@fontsource/patrick-hand/400.css";
import "@fontsource/nunito/400.css";
import "@fontsource/nunito/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "./styles.css";

import { createRoot } from "react-dom/client";
import { installAutosave, loadLocalScene } from "./data/autosave";
import { Store } from "./state/store";
import { App } from "./ui/App";

const FONTS = ['400 20px "Patrick Hand"', '400 16px "Nunito"', '700 16px "Nunito"', '400 16px "JetBrains Mono"'];

/** Text is measured with these fonts, so wait for them (briefly) before the first measurement. */
async function loadFonts() {
  const all = Promise.all(FONTS.map((f) => document.fonts.load(f).catch(() => [])));
  await Promise.race([all, new Promise((resolve) => setTimeout(resolve, 2500))]);
}

async function boot() {
  await loadFonts();
  const saved = loadLocalScene();
  const store = new Store(saved?.appState);
  if (saved) store.scene.setAll(saved.elements);
  store.history.reset();
  installAutosave(store);

  // Test hook for the end-to-end suite (never present in normal builds).
  if (import.meta.env.VITE_E2E === "1") {
    (window as unknown as { __sketchboard: unknown }).__sketchboard = {
      store,
      elements: () => store.scene.visible(),
      state: () => store.state,
    };
  }

  createRoot(document.getElementById("root")!).render(<App store={store} />);
}

void boot();
