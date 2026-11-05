import { useEffect, useRef, useState } from "react";
import { cancelEmbed, confirmEmbed } from "../state/rich";
import { useStore } from "./StoreContext";

/** Asks for the address of a web embed. Only a few well-known sites are accepted (see embed.ts). */
export function EmbedDialog() {
  const store = useStore();
  const id = store.state.embedDraftId;
  const existing = id ? store.scene.get(id)?.link ?? "" : "";
  const [value, setValue] = useState(existing);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        cancelEmbed(store);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [store]);

  const submit = () => setError(confirmEmbed(store, value));

  return (
    <div className="backdrop" onPointerDown={() => cancelEmbed(store)}>
      <div className="dialog island" role="dialog" aria-modal="true" aria-labelledby="embed-title" onPointerDown={(e) => e.stopPropagation()}>
        <h2 id="embed-title">Embed a web page</h2>
        <p>Paste a link to a YouTube or Vimeo video, a Figma file, a CodePen, a Google Map, or a Google Doc, Sheet or Slides.</p>
        <input
          ref={inputRef}
          className="url-input"
          type="url"
          placeholder="https://www.youtube.com/watch?v=…"
          value={value}
          spellCheck={false}
          aria-invalid={error !== null}
          aria-describedby={error ? "embed-error" : undefined}
          data-testid="embed-url"
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        {error && (
          <p className="form-error" id="embed-error" role="alert" data-testid="embed-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn-text" data-testid="embed-cancel" onClick={() => cancelEmbed(store)}>
            Cancel
          </button>
          <button type="button" className="btn-text primary" data-testid="embed-ok" onClick={submit}>
            Embed
          </button>
        </div>
      </div>
    </div>
  );
}
