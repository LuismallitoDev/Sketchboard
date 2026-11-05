import { useEffect, useMemo, useState } from "react";
import { InteractionController } from "../input/controller";
import { installKeyboard } from "../input/keyboard";
import { resolveTheme } from "../state/operations";
import type { Store } from "../state/store";
import { CanvasLayer } from "./CanvasLayer";
import { Footer, ThemeToggle } from "./Footer";
import { PropertiesPanel } from "./PropertiesPanel";
import { StoreProvider } from "./StoreContext";
import { Toolbar } from "./Toolbar";

export function App({ store }: { store: Store }) {
  const controller = useMemo(() => new InteractionController(store), [store]);
  const [, bumpSystemTheme] = useState(0);

  useEffect(() => installKeyboard(store, controller), [store, controller]);

  // Apply the theme to <html> (the CSS and the canvas filter hang off data-theme) and follow the OS in "system" mode.
  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(store.state.theme);
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => {
      apply();
      bumpSystemTheme((n) => n + 1);
    };
    mq.addEventListener("change", onSystem);
    const unsubscribe = store.subscribe(apply);
    return () => {
      mq.removeEventListener("change", onSystem);
      unsubscribe();
    };
  }, [store]);

  return (
    <StoreProvider value={store}>
      <div className="app">
        <CanvasLayer controller={controller} />
        <div className="brand" aria-label="Sketchboard">
          <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="currentColor" />
            <path d="M7 21c3-9 6-9 8-4s5 4 10-6" fill="none" stroke="var(--ui-bg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Sketchboard</span>
        </div>
        <Toolbar />
        <PropertiesPanel />
        <ThemeToggle />
        <Footer />
      </div>
    </StoreProvider>
  );
}
