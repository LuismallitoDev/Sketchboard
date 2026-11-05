import { useEffect, useRef } from "react";
import { filesVersion, subscribeFiles } from "../data/files";
import type { InteractionController } from "../input/controller";
import type { PointerInfo } from "../input/types";
import { renderInteractive } from "../render/renderInteractive";
import { renderStatic } from "../render/renderStatic";
import { cancelEyedropper, pickEyedropperColor, resolveTheme, setZoom } from "../state/operations";
import { screenToScene } from "../state/viewport";
import { insertImageFile } from "../state/rich";
import { EmbedInteractButton, EmbedLayer } from "./EmbedLayer";
import { FrameNameEditor } from "./FrameNameEditor";
import { TextEditor } from "./TextEditor";
import { useStore, useStoreVersion } from "./StoreContext";

interface PointerLike {
  clientX: number;
  clientY: number;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  button: number;
  timeStamp: number;
  pressure?: number;
  pointerType?: string;
}

/** The two stacked canvases (scene + selection overlay), their input handlers and the text-editor layer. */
export function CanvasLayer({ controller }: { controller: InteractionController }) {
  const store = useStore();
  useStoreVersion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const staticRef = useRef<HTMLCanvasElement>(null);
  const interactiveRef = useRef<HTMLCanvasElement>(null);

  // Track the canvas size.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const update = () => {
      const r = wrap.getBoundingClientRect();
      store.setState({ width: r.width, height: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [store]);

  // Paint on every store change, at most once per animation frame.
  useEffect(() => {
    let raf = 0;
    let lastStaticKey: unknown[] | null = null;

    const draw = () => {
      raf = 0;
      const st = staticRef.current;
      const it = interactiveRef.current;
      if (!st || !it) return;
      const s = store.state;
      const els = store.scene.all();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(s.width * dpr));
      const h = Math.max(1, Math.round(s.height * dpr));
      let resized = false;
      for (const c of [st, it]) {
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
          resized = true;
        }
      }
      const key = [
        els,
        s.offsetX,
        s.offsetY,
        s.zoom,
        s.width,
        s.height,
        s.viewBackgroundColor,
        s.editingTextId,
        s.editingFrameId,
        s.erasingIds,
        s.gridMode,
        s.frameRendering,
        s.theme,
        filesVersion(),
        dpr,
      ];
      if (resized || !lastStaticKey || key.some((v, i) => !Object.is(v, lastStaticKey![i]))) {
        renderStatic(st, s, els, dpr);
        lastStaticKey = key;
      }
      const ids = new Set(s.selectedIds);
      const selected = els.filter((e) => !e.isDeleted && ids.has(e.id));
      const highlight = s.bindingHighlight ? (store.scene.get(s.bindingHighlight) ?? null) : null;
      renderInteractive(it, s, selected, dpr, resolveTheme(s.theme) === "dark", highlight);

      // The laser pointer's trail fades by itself: keep animating until it is gone.
      if (s.laserTrail.length > 0) {
        const now = performance.now();
        const fresh = s.laserTrail.filter((p) => now - p.t < 900);
        if (fresh.length !== s.laserTrail.length) store.setState({ laserTrail: fresh });
        else request();
      }
    };

    function request() {
      if (!raf) raf = requestAnimationFrame(draw);
    }
    const unsubscribe = store.subscribe(request);
    const unsubscribeFiles = subscribeFiles(request); // pictures finished loading
    request();
    return () => {
      unsubscribe();
      unsubscribeFiles();
      cancelAnimationFrame(raf);
    };
  }, [store]);

  // Wheel: Ctrl/Cmd (or trackpad pinch) zooms around the pointer, otherwise it pans. Needs a non-passive listener.
  useEffect(() => {
    const canvas = interactiveRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const unit = e.deltaMode === 1 ? 16 : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      const s = store.state;
      if (e.ctrlKey || e.metaKey) {
        const step = Math.max(-25, Math.min(25, dy));
        setZoom(store, s.zoom * Math.exp(-step * 0.01), sx, sy);
      } else {
        store.setState({ offsetX: s.offsetX - (e.shiftKey ? dy : dx), offsetY: s.offsetY - (e.shiftKey ? 0 : dy) });
      }
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [store]);

  /** The colour of the scene pixel under a screen position (raw element colours: the dark-mode filter is CSS only). */
  const sampleColor = (sx: number, sy: number): string | null => {
    const ctx = staticRef.current?.getContext("2d");
    if (!ctx) return null;
    const dpr = window.devicePixelRatio || 1;
    const d = ctx.getImageData(Math.round(sx * dpr), Math.round(sy * dpr), 1, 1).data;
    if (d[3] === 0) return null;
    return "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
  };

  const info = (e: PointerLike): PointerInfo => {
    const rect = interactiveRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    return {
      screen: [sx, sy],
      scene: screenToScene(store.state, sx, sy),
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      button: e.button,
      pressure: e.pressure ?? 0.5,
      pointerType: e.pointerType ?? "mouse",
      timeStamp: e.timeStamp,
    };
  };

  /** Pen mode: touch is ignored, so a resting palm cannot draw while a pen or mouse is used. */
  const ignoredTouch = (e: { pointerType?: string }) => store.state.penMode && e.pointerType === "touch";

  return (
    <div
      className="canvas-wrap"
      ref={wrapRef}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        // Pictures dropped on the canvas land where they were dropped.
        const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
        if (files.length === 0) return;
        e.preventDefault();
        const rect = wrapRef.current!.getBoundingClientRect();
        const at = screenToScene(store.state, e.clientX - rect.left, e.clientY - rect.top);
        files.forEach((f, i) => void insertImageFile(store, f, [at[0] + i * 24, at[1] + i * 24]));
      }}
    >
      <canvas ref={staticRef} className="static-canvas" />
      <EmbedLayer />
      <canvas
        ref={interactiveRef}
        className="interactive-canvas"
        style={{ cursor: store.state.cursor }}
        data-testid="canvas"
        onPointerDown={(e) => {
          if (ignoredTouch(e)) return;
          const dropper = store.state.eyedropper;
          if (dropper) {
            // Colour picking takes over the pointer: a click applies the colour under it.
            const i = info(e);
            const color = sampleColor(i.screen[0], i.screen[1]);
            if (color) pickEyedropperColor(store, color);
            else cancelEyedropper(store);
            return;
          }
          e.currentTarget.setPointerCapture(e.pointerId);
          if (e.button === 1) e.preventDefault();
          controller.pointerDown(info(e));
        }}
        onPointerMove={(e) => {
          if (ignoredTouch(e)) return;
          const dropper = store.state.eyedropper;
          if (dropper) {
            const i = info(e);
            store.setState({ eyedropper: { ...dropper, color: sampleColor(i.screen[0], i.screen[1]), x: i.screen[0], y: i.screen[1] } });
            return;
          }
          controller.pointerMove(info(e));
        }}
        onPointerUp={(e) => {
          if (ignoredTouch(e)) return;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          controller.pointerUp(info(e));
        }}
        onPointerCancel={() => controller.pointerCancel()}
        onDoubleClick={(e) => controller.doubleClick(info(e.nativeEvent))}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="dom-layer">
        <TextEditor />
        <FrameNameEditor />
        <EmbedInteractButton />
        {store.state.eyedropper?.color && (
          <div className="eyedropper-chip" data-testid="eyedropper-chip" style={{ left: store.state.eyedropper.x + 18, top: store.state.eyedropper.y + 18 }}>
            <span style={{ background: store.state.eyedropper.color }} />
            {store.state.eyedropper.color}
          </div>
        )}
      </div>
    </div>
  );
}
