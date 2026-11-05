import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { startEyedropper } from "../state/operations";
import { PALETTE, normalizeHex } from "./colors";
import { Icon } from "./icons";
import { Popover } from "./Popover";
import { useStore } from "./StoreContext";

interface Props {
  /** Current colour, or null when a mixed selection has different colours. */
  value: string | null;
  /** Quick-pick colours shown inline (may include "transparent"). */
  picks: readonly string[];
  allowTransparent?: boolean;
  onChange: (color: string) => void;
  testId: string;
  label: string;
  /** Offers a button to pick the colour from the canvas, setting this colour. */
  eyedropper?: "stroke" | "background";
}

const swatchStyle = (c: string | null) => (c && c !== "transparent" ? { backgroundColor: c } : undefined);

function Swatch({ color, selected, onPick, title, testId }: { color: string; selected: boolean; onPick: () => void; title: string; testId?: string }) {
  return (
    <button
      type="button"
      className={`swatch${color === "transparent" ? " transparent" : ""}`}
      style={swatchStyle(color)}
      aria-pressed={selected}
      aria-label={title}
      title={title}
      data-testid={testId}
      onClick={onPick}
    />
  );
}

/** Quick picks plus a popover with the full palette (5 shades per colour), a hex field and an eyedropper. */
export function ColorField({ value, picks, allowTransparent, onChange, testId, label, eyedropper }: Props) {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState("");
  const [invalid, setInvalid] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    setHex(value && value !== "transparent" ? value : "");
    setInvalid(false);
  }, [value, open]);

  const pick = (c: string) => onChange(c);
  const commitHex = () => {
    const n = normalizeHex(hex);
    if (n) {
      setInvalid(false);
      pick(n);
    } else if (hex.trim() !== "") {
      setInvalid(true);
    }
  };

  return (
    <div className="color-field" data-testid={testId}>
      <div className="choices">
        {picks.map((c) => (
          <Swatch key={c} color={c} selected={value === c} onPick={() => pick(c)} title={c === "transparent" ? t("color.transparent") : c} />
        ))}
        <span className="sep" />
        <button
          ref={anchorRef}
          type="button"
          className={`swatch current${value === "transparent" ? " transparent" : ""}`}
          style={swatchStyle(value)}
          aria-label={`${label}: ${value ?? "mixed"}`}
          aria-expanded={open}
          data-testid={`${testId}-open`}
          onClick={() => setOpen((o) => !o)}
        />
        {eyedropper && (
          <button
            type="button"
            className="btn small"
            title={`${t("action.eyedropper")} — I`}
            data-testid={`${testId}-eyedropper`}
            onClick={() => startEyedropper(store, eyedropper)}
          >
            <Icon name="eyedropper" size={16} />
          </button>
        )}
      </div>
      {open && (
        <Popover anchor={anchorRef} onClose={close} label={label}>
          <div className="palette">
            {[0, 1, 2, 3, 4].map((shade) =>
              PALETTE.map((hue) => (
                <Swatch
                  key={`${hue.name}-${shade}`}
                  color={hue.shades[shade]}
                  selected={value === hue.shades[shade]}
                  title={`${hue.name} ${shade + 1}`}
                  testId={`${testId}-${hue.name}-${shade + 1}`}
                  onPick={() => pick(hue.shades[shade])}
                />
              )),
            )}
          </div>
          <div className="hex-row">
            {allowTransparent && <Swatch color="transparent" selected={value === "transparent"} title={t("color.transparent")} onPick={() => pick("transparent")} />}
            <label>
              <span className="visually-hidden">{t("color.hex")}</span>
              <input
                className={`hex-input${invalid ? " invalid" : ""}`}
                value={hex}
                placeholder="#000000"
                maxLength={9}
                spellCheck={false}
                aria-invalid={invalid}
                data-testid={`${testId}-hex`}
                onChange={(e) => setHex(e.target.value)}
                onBlur={commitHex}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitHex();
                }}
              />
            </label>
          </div>
        </Popover>
      )}
    </div>
  );
}
