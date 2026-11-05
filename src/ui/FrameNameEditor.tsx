import { useEffect, useRef, useState } from "react";
import { getLocalBox } from "../geometry/bounds";
import { finishFrameRename } from "../state/rich";
import { useStore, useStoreVersion } from "./StoreContext";

/** The small input shown over a frame's name while it is renamed (double-click the frame, or press Enter on it). */
export function FrameNameEditor() {
  const store = useStore();
  useStoreVersion();
  const id = store.state.editingFrameId;
  const el = id ? store.scene.get(id) : undefined;
  if (!id || !el || el.type !== "frame") return null;
  return <Inner key={id} id={id} initial={el.name ?? ""} />;
}

function Inner({ id, initial }: { id: string; initial: string }) {
  const store = useStore();
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const el = store.scene.get(id)!;
  const { zoom, offsetX, offsetY } = store.state;
  const box = getLocalBox(el);
  const finish = (name?: string) => {
    if (done.current) return;
    done.current = true;
    finishFrameRename(store, name);
  };

  return (
    <input
      ref={ref}
      className="frame-name-editor"
      data-testid="frame-name-editor"
      aria-label="Frame name"
      value={value}
      spellCheck={false}
      style={{ left: box.x * zoom + offsetX - 2, top: box.y * zoom + offsetY - 28, width: Math.max(140, Math.min(box.width * zoom, 320)) }}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          finish(); // cancel
        }
      }}
    />
  );
}
