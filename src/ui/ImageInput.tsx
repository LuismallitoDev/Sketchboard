import { useEffect, useRef } from "react";
import { PICK_IMAGE_EVENT } from "../actions";
import { insertImageFile } from "../state/rich";
import { useStore } from "./StoreContext";

const isImage = (f: File) => f.type.startsWith("image/");

/**
 * The hidden file input behind "Insert image", plus pasting pictures from the clipboard. (Dropping files onto the
 * canvas is handled by the canvas itself.) Several pictures are staggered so they do not land exactly on top of each other.
 */
export function ImageInput() {
  const store = useStore();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const open = () => ref.current?.click();
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const files = [...(e.clipboardData?.files ?? [])].filter(isImage);
      if (files.length === 0) return;
      e.preventDefault();
      files.forEach((f, i) => void insertImageFile(store, f, viewCentre(store, i)));
    };
    window.addEventListener(PICK_IMAGE_EVENT, open);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener(PICK_IMAGE_EVENT, open);
      window.removeEventListener("paste", onPaste);
    };
  }, [store]);

  return (
    <input
      ref={ref}
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp,image/avif"
      multiple
      hidden
      data-testid="image-input"
      onChange={(e) => {
        const files = [...(e.target.files ?? [])].filter(isImage);
        files.forEach((f, i) => void insertImageFile(store, f, viewCentre(store, i)));
        e.target.value = ""; // so picking the same file again works
      }}
    />
  );
}

function viewCentre(store: ReturnType<typeof useStore>, index: number): [number, number] {
  const s = store.state;
  return [(s.width / 2 - s.offsetX) / s.zoom + index * 24, (s.height / 2 - s.offsetY) / s.zoom + index * 24];
}
