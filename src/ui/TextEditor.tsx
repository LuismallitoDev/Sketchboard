import { useEffect, useRef } from "react";
import { measureText } from "../geometry/text";
import { FONT_FAMILY_CSS } from "../scene/constants";
import type { TextElement } from "../scene/types";
import { finishTextEdit } from "../state/operations";
import { useStore, useStoreVersion } from "./StoreContext";

/** The in-place <textarea> shown over a text element while it is being edited. */
export function TextEditor() {
  const store = useStore();
  useStoreVersion();
  const id = store.state.editingTextId;
  const el = id ? store.scene.get(id) : undefined;
  if (!id || !el || el.type !== "text") return null;
  return <TextEditorInner key={id} el={el} />;
}

function TextEditorInner({ el }: { el: TextElement }) {
  const store = useStore();
  const ref = useRef<HTMLTextAreaElement>(null);
  const { zoom, offsetX, offsetY, editingIsNew } = store.state;

  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.focus();
    if (!editingIsNew) ta.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = (text: string) => {
    const cur = store.scene.get(el.id) as TextElement | undefined;
    if (!cur) return;
    const m = measureText(text, cur.fontSize, cur.fontFamily, cur.lineHeight);
    // Keep the anchor that matches the alignment, so the text grows in the expected direction.
    const x = cur.textAlign === "left" ? cur.x : cur.textAlign === "center" ? cur.x + cur.width / 2 - m.width / 2 : cur.x + cur.width - m.width;
    store.scene.update(el.id, { text, width: m.width, height: m.height, x });
  };

  const left = el.x * zoom + offsetX;
  const top = el.y * zoom + offsetY;
  return (
    <textarea
      ref={ref}
      className="text-editor"
      data-testid="text-editor"
      wrap="off"
      spellCheck={false}
      value={el.text}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        if (store.state.editingTextId === el.id) finishTextEdit(store);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          e.stopPropagation();
          finishTextEdit(store);
        }
      }}
      style={{
        left,
        top,
        width: Math.max(el.width * zoom + 6, 8),
        height: Math.max(el.height * zoom, el.fontSize * el.lineHeight * zoom),
        font: `${el.fontSize * zoom}px ${FONT_FAMILY_CSS[el.fontFamily]}`,
        lineHeight: el.lineHeight,
        color: el.strokeColor,
        textAlign: el.textAlign,
        opacity: el.opacity / 100,
        transform: el.angle ? `rotate(${el.angle}rad)` : undefined,
      }}
    />
  );
}
