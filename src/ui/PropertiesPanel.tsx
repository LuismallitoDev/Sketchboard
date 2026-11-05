import type { ReactNode } from "react";
import { t } from "../i18n";
import { FONT_FAMILY_CSS, FONT_SIZES, ROUGHNESS_LEVELS, STROKE_WIDTHS } from "../scene/constants";
import type { ElementType, ItemStyle, SketchElement } from "../scene/types";
import type { ToolType } from "../state/appState";
import { applyItemStyle, selectedElements } from "../state/operations";
import { stylePatchFor } from "../state/style";
import { BACKGROUND_TOP_PICKS, STROKE_TOP_PICKS } from "./colors";
import { ColorField } from "./ColorPicker";
import { useStore, useStoreVersion } from "./StoreContext";

const TOOL_TYPES: Partial<Record<ToolType, ElementType>> = {
  rectangle: "rectangle",
  diamond: "diamond",
  ellipse: "ellipse",
  arrow: "arrow",
  line: "line",
  freedraw: "freedraw",
  text: "text",
};

/** The value of a style property across the selection (null when mixed), or the current default with no selection. */
function styleValue<K extends keyof ItemStyle>(sel: readonly SketchElement[], current: ItemStyle, key: K): ItemStyle[K] | null {
  if (sel.length === 0) return current[key];
  const probe = { [key]: current[key] } as Partial<ItemStyle>;
  const vals = sel.filter((e) => Object.keys(stylePatchFor(e, probe)).length > 0).map((e) => (e as unknown as ItemStyle)[key]);
  if (vals.length === 0) return current[key];
  return vals.every((v) => Object.is(v, vals[0])) ? vals[0] : null;
}

interface Option<T> {
  id: string;
  value: T;
  title: string;
  node: ReactNode;
}

function ChoiceRow<T>({ label, value, options, onChange, testId }: { label: string; value: T | null; options: Option<T>[]; onChange: (v: T) => void; testId: string }) {
  return (
    <section data-testid={testId}>
      <h3>{label}</h3>
      <div className="choices">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className="choice"
            title={o.title}
            aria-label={o.title}
            aria-pressed={value !== null && Object.is(value, o.value)}
            data-testid={`${testId}-${o.id}`}
            onClick={() => onChange(o.value)}
          >
            {o.node}
          </button>
        ))}
      </div>
    </section>
  );
}

const line = (d: string, dash?: string) => (
  <svg width="22" height="14" viewBox="0 0 22 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d={d} strokeDasharray={dash} />
  </svg>
);

export function PropertiesPanel() {
  const store = useStore();
  useStoreVersion();
  const s = store.state;
  const sel = selectedElements(store);
  const toolType = TOOL_TYPES[s.tool];
  const kinds = new Set<ElementType>(sel.length ? sel.map((e) => e.type) : toolType ? [toolType] : []);
  if (kinds.size === 0) return null;

  const has = (...types: ElementType[]) => types.some((x) => kinds.has(x));
  const val = <K extends keyof ItemStyle>(k: K) => styleValue(sel, s.currentItem, k);
  const set = (patch: Partial<ItemStyle>) => applyItemStyle(store, patch);

  const isShape = has("rectangle", "diamond", "ellipse");
  const hasStrokeLook = isShape || has("line", "arrow");
  const opacity = val("opacity");

  return (
    <div className="island panel" aria-label="Properties" data-testid="properties-panel">
      <section>
        <h3>{t("prop.stroke")}</h3>
        <ColorField label={t("prop.stroke")} value={val("strokeColor")} picks={STROKE_TOP_PICKS} onChange={(c) => set({ strokeColor: c })} testId="stroke-color" />
      </section>

      {isShape && (
        <section>
          <h3>{t("prop.background")}</h3>
          <ColorField
            label={t("prop.background")}
            value={val("backgroundColor")}
            picks={BACKGROUND_TOP_PICKS}
            allowTransparent
            onChange={(c) => set({ backgroundColor: c })}
            testId="background-color"
          />
        </section>
      )}

      {isShape && (
        <ChoiceRow
          label={t("prop.fill")}
          testId="fill-style"
          value={val("fillStyle")}
          onChange={(v) => set({ fillStyle: v })}
          options={(["hachure", "cross-hatch", "solid", "zigzag"] as const).map((f) => ({
            id: f,
            value: f,
            title: f,
            node: <span className={`fill-sample fill-${f}`} />,
          }))}
        />
      )}

      {!has("text") || kinds.size > 1 ? (
        <ChoiceRow
          label={t("prop.strokeWidth")}
          testId="stroke-width"
          value={val("strokeWidth")}
          onChange={(v) => set({ strokeWidth: v })}
          options={STROKE_WIDTHS.map((w, i) => ({
            id: String(w),
            value: w as number,
            title: ["Thin", "Bold", "Extra bold"][i],
            node: <span className="w-sample" style={{ height: w + 1 }} />,
          }))}
        />
      ) : null}

      {hasStrokeLook && (
        <ChoiceRow
          label={t("prop.strokeStyle")}
          testId="stroke-style"
          value={val("strokeStyle")}
          onChange={(v) => set({ strokeStyle: v })}
          options={[
            { id: "solid", value: "solid" as const, title: "Solid", node: line("M2 7h18") },
            { id: "dashed", value: "dashed" as const, title: "Dashed", node: line("M2 7h18", "5 4") },
            { id: "dotted", value: "dotted" as const, title: "Dotted", node: line("M2 7h18", "0.5 4.5") },
          ]}
        />
      )}

      {hasStrokeLook && (
        <ChoiceRow
          label={t("prop.sloppiness")}
          testId="sloppiness"
          value={val("roughness")}
          onChange={(v) => set({ roughness: v })}
          options={ROUGHNESS_LEVELS.map((r) => ({
            id: String(r),
            value: r as number,
            title: ["Architect", "Artist", "Cartoonist"][r],
            node: line(["M2 7h18", "M2 8c4-3 7 2 10-1s5 1 8 0", "M2 9c3-7 6 4 9-2s4 5 9-3"][r]),
          }))}
        />
      )}

      {has("rectangle", "diamond") && (
        <ChoiceRow
          label={t("prop.edges")}
          testId="edges"
          value={val("roundness")}
          onChange={(v) => set({ roundness: v })}
          options={[
            { id: "sharp", value: false, title: "Sharp", node: line("M3 12V3h16") },
            { id: "round", value: true, title: "Round", node: line("M3 12V8a5 5 0 015-5h11") },
          ]}
        />
      )}

      {has("arrow") && (
        <>
          <ChoiceRow
            label={`${t("prop.arrowheads")} · start`}
            testId="arrowhead-start"
            value={val("startArrowhead")}
            onChange={(v) => set({ startArrowhead: v })}
            options={[
              { id: "none", value: null, title: "No arrowhead", node: line("M4 7h16") },
              { id: "arrow", value: "arrow" as const, title: "Arrow", node: line("M4 7h16 M10 2L4 7l6 5") },
            ]}
          />
          <ChoiceRow
            label={`${t("prop.arrowheads")} · end`}
            testId="arrowhead-end"
            value={val("endArrowhead")}
            onChange={(v) => set({ endArrowhead: v })}
            options={[
              { id: "none", value: null, title: "No arrowhead", node: line("M2 7h16") },
              { id: "arrow", value: "arrow" as const, title: "Arrow", node: line("M2 7h16 M12 2l6 5-6 5") },
            ]}
          />
        </>
      )}

      {has("freedraw") && (
        <ChoiceRow
          label={t("prop.pressure")}
          testId="pressure"
          value={val("simulatePressure")}
          onChange={(v) => set({ simulatePressure: v })}
          options={[
            { id: "variable", value: true, title: "Variable", node: <span className="text-choice">Variable</span> },
            { id: "constant", value: false, title: "Constant", node: <span className="text-choice">Constant</span> },
          ]}
        />
      )}

      {has("text") && (
        <>
          <ChoiceRow
            label={t("prop.fontFamily")}
            testId="font-family"
            value={val("fontFamily")}
            onChange={(v) => set({ fontFamily: v })}
            options={(
              [
                ["hand", "Hand-drawn"],
                ["normal", "Normal"],
                ["code", "Code"],
              ] as const
            ).map(([f, title]) => ({
              id: f,
              value: f,
              title,
              node: <span style={{ fontFamily: FONT_FAMILY_CSS[f], fontSize: 16 }}>Aa</span>,
            }))}
          />
          <ChoiceRow
            label={t("prop.fontSize")}
            testId="font-size"
            value={val("fontSize")}
            onChange={(v) => set({ fontSize: v })}
            options={FONT_SIZES.map((f) => ({ id: f.label, value: f.value as number, title: `${f.label} (${f.value})`, node: <span className="text-choice">{f.label}</span> }))}
          />
          <ChoiceRow
            label={t("prop.textAlign")}
            testId="text-align"
            value={val("textAlign")}
            onChange={(v) => set({ textAlign: v })}
            options={[
              { id: "left", value: "left" as const, title: "Left", node: line("M3 3h16 M3 7h10 M3 11h13") },
              { id: "center", value: "center" as const, title: "Center", node: line("M3 3h16 M6 7h10 M4.5 11h13") },
              { id: "right", value: "right" as const, title: "Right", node: line("M3 3h16 M9 7h10 M6 11h13") },
            ]}
          />
        </>
      )}

      <section>
        <h3>
          {t("prop.opacity")} <span className="muted">{opacity === null ? "—" : opacity}</span>
        </h3>
        <input
          type="range"
          min={0}
          max={100}
          step={10}
          value={opacity ?? 100}
          aria-label={t("prop.opacity")}
          data-testid="opacity"
          onChange={(e) => set({ opacity: Number(e.target.value) })}
        />
      </section>
    </div>
  );
}
