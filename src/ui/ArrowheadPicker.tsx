import { useCallback, useRef, useState } from "react";
import { ARROWHEAD_KINDS, ARROWHEAD_LABELS, arrowheadPrimitives } from "../render/arrowheads";
import type { Arrowhead } from "../scene/types";
import { Popover } from "./Popover";

/** A small drawing of an arrowhead at the end of a line. `start` mirrors it so it points left. */
export function ArrowheadPreview({ kind, start = false }: { kind: Arrowhead | null; start?: boolean }) {
  const prims = kind ? arrowheadPrimitives(kind, [38, 11], [2, 11], 14) : [];
  return (
    <svg width="44" height="22" viewBox="0 0 44 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g transform={start ? "translate(44 0) scale(-1 1)" : undefined}>
        <path d="M2 11h36" />
        {prims.map((p, i) => {
          if (p.k === "line") return <line key={i} x1={p.a[0]} y1={p.a[1]} x2={p.b[0]} y2={p.b[1]} />;
          const fill = p.filled ? "currentColor" : "var(--ui-bg)";
          if (p.k === "poly") return <polygon key={i} points={p.pts.map((q) => q.join(",")).join(" ")} fill={fill} />;
          return <circle key={i} cx={p.c[0]} cy={p.c[1]} r={p.r} fill={fill} />;
        })}
      </g>
    </svg>
  );
}

interface Props {
  label: string;
  /** null for a mixed selection. */
  value: Arrowhead | null;
  /** The arrow's end the picker is for (the preview points that way). */
  side: "start" | "end";
  onChange: (kind: Arrowhead | null) => void;
  testId: string;
}

/** Button showing the current arrowhead; opens a grid of every kind (plus "none"). */
export function ArrowheadPicker({ label, value, side, onChange, testId }: Props) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const start = side === "start";

  return (
    <div data-testid={testId}>
      <button
        ref={anchorRef}
        type="button"
        className="choice wide"
        title={`${label}: ${value ? ARROWHEAD_LABELS[value] : "None"}`}
        aria-label={`${label}: ${value ? ARROWHEAD_LABELS[value] : "None"}`}
        aria-expanded={open}
        data-testid={`${testId}-open`}
        onClick={() => setOpen((o) => !o)}
      >
        <ArrowheadPreview kind={value} start={start} />
      </button>
      {open && (
        <Popover anchor={anchorRef} onClose={close} label={label}>
          <div className="arrowhead-grid">
            {[null, ...ARROWHEAD_KINDS].map((kind) => (
              <button
                key={kind ?? "none"}
                type="button"
                className="choice wide"
                title={kind ? ARROWHEAD_LABELS[kind] : "None"}
                aria-label={kind ? ARROWHEAD_LABELS[kind] : "None"}
                aria-pressed={value === kind}
                data-testid={`${testId}-${kind ?? "none"}`}
                onClick={() => {
                  onChange(kind);
                  close();
                }}
              >
                <ArrowheadPreview kind={kind} start={start} />
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}
