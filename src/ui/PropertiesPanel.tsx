import type { ReactNode } from "react";
import { actionByName, runAction } from "../actions";
import { t } from "../i18n";
import { FONT_FAMILY_CSS, FONT_SIZES, ROUGHNESS_LEVELS, STROKE_WIDTHS } from "../scene/constants";
import type { ElementType, ItemStyle, SketchElement } from "../scene/types";
import type { ToolType } from "../state/appState";
import { applyItemStyle, convertSelectedType, selectedElements, setTextMode, setViewBackground } from "../state/operations";
import { renameFrame } from "../state/rich";
import { stylePatchFor } from "../state/style";
import { ArrowheadPicker } from "./ArrowheadPicker";
import { BACKGROUND_TOP_PICKS, STROKE_TOP_PICKS, VIEW_BACKGROUNDS } from "./colors";
import { ColorField } from "./ColorPicker";
import { Icon, type IconName } from "./icons";
import { useStore, useStoreVersion } from "./StoreContext";

const TOOL_TYPES: Partial<Record<ToolType, ElementType>> = {
  rectangle: "rectangle",
  diamond: "diamond",
  ellipse: "ellipse",
  arrow: "arrow",
  line: "line",
  freedraw: "freedraw",
  autoshape: "freedraw", // draws freehand, so it shares the pen's options
  text: "text",
};

/** The value of a style property on an element, in the terms of ItemStyle. */
function readStyle(el: SketchElement, key: keyof ItemStyle): unknown {
  if (key === "lineCurved") return el.type === "line" ? el.arrowType === "round" : undefined;
  return (el as unknown as Record<string, unknown>)[key];
}

/** The value of a style property across the selection (null when mixed), or the current default with no selection. */
function styleValue<K extends keyof ItemStyle>(sel: readonly SketchElement[], current: ItemStyle, key: K): ItemStyle[K] | null {
  if (sel.length === 0) return current[key];
  const probe = { [key]: current[key] } as Partial<ItemStyle>;
  const vals = sel.filter((e) => Object.keys(stylePatchFor(e, probe)).length > 0).map((e) => readStyle(e, key) as ItemStyle[K]);
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

/** A button that runs a registered action; disabled when the action does not apply to the selection. */
function ActionButton({ name, icon, hideWhenDisabled = false }: { name: string; icon: IconName; hideWhenDisabled?: boolean }) {
  const store = useStore();
  const a = actionByName(name);
  if (!a) return null;
  const enabled = a.enabled?.(store) ?? true;
  if (!enabled && hideWhenDisabled) return null;
  return (
    <button
      type="button"
      className="btn small"
      disabled={!enabled}
      title={a.shortcut ? `${a.label} — ${a.shortcut}` : a.label}
      aria-label={a.label}
      data-testid={`action-${name}`}
      onClick={() => runAction(store, name)}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

function ActionRow({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <section data-testid={testId}>
      <h3>{label}</h3>
      <div className="choices actions">{children}</div>
    </section>
  );
}

/** Name and membership of the selected frame. */
function FrameSection({ id, name }: { id: string; name: string | null }) {
  const store = useStore();
  return (
    <section data-testid="frame-section">
      <h3>Frame</h3>
      <input
        className="text-input"
        value={name ?? ""}
        placeholder="Frame"
        aria-label="Frame name"
        data-testid="frame-name"
        spellCheck={false}
        onChange={(e) => renameFrame(store, id, e.target.value)}
        onBlur={() => store.commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <div className="choices actions" style={{ marginTop: 8 }}>
        <ActionButton name="selectAllInFrame" icon="group" />
        <ActionButton name="removeFromFrame" icon="ungroup" />
      </div>
    </section>
  );
}

export function PropertiesPanel() {
  const store = useStore();
  useStoreVersion();
  const s = store.state;
  const sel = selectedElements(store);
  const toolType = TOOL_TYPES[s.tool];
  const kinds = new Set<ElementType>(sel.length ? sel.map((e) => e.type) : toolType ? [toolType] : []);

  // Bucket fill paints closed shapes with the background colour chosen here.
  if (s.tool === "bucket" && sel.length === 0) {
    return (
      <div className="island panel" aria-label="Bucket fill" data-testid="properties-panel">
        <section>
          <h3>{t("prop.background")}</h3>
          <ColorField
            label={t("prop.background")}
            value={s.currentItem.backgroundColor}
            picks={BACKGROUND_TOP_PICKS}
            allowTransparent
            onChange={(c) => applyItemStyle(store, { backgroundColor: c })}
            testId="background-color"
            eyedropper="background"
          />
        </section>
      </div>
    );
  }

  // Nothing to style: with the selection tool and an empty selection the panel offers the canvas background.
  if (kinds.size === 0) {
    if (s.tool !== "selection" || sel.length > 0) return null;
    return (
      <div className="island panel" aria-label="Canvas" data-testid="properties-panel">
        <section>
          <h3>{t("prop.canvasBackground")}</h3>
          <ColorField
            label={t("prop.canvasBackground")}
            value={s.viewBackgroundColor}
            picks={VIEW_BACKGROUNDS}
            onChange={(c) => setViewBackground(store, c)}
            testId="canvas-background"
          />
        </section>
      </div>
    );
  }

  const has = (...types: ElementType[]) => types.some((x) => kinds.has(x));
  const val = <K extends keyof ItemStyle>(k: K) => styleValue(sel, s.currentItem, k);
  const set = (patch: Partial<ItemStyle>) => applyItemStyle(store, patch);

  const isShape = has("rectangle", "diamond", "ellipse");
  const hasFill = isShape || sel.some((e) => e.type === "line" && e.polygon);
  const hasStrokeLook = isShape || has("line", "arrow");
  // Pictures, frames and embeds have no stroke or fill of their own (pictures and embeds can still be faded).
  const hasStyle = [...kinds].some((k) => k !== "image" && k !== "frame" && k !== "embeddable");
  const hasOpacity = hasStyle || has("image", "embeddable");
  const opacity = val("opacity");
  const looseTexts = sel.filter((e) => e.type === "text" && !e.containerId);
  const textMode: "auto" | "fixed" | null =
    looseTexts.length === 0 ? null : looseTexts.every((e) => e.type === "text" && e.autoResize) ? "auto" : looseTexts.every((e) => e.type === "text" && !e.autoResize) ? "fixed" : null;
  const allShapes = sel.length > 0 && sel.every((e) => e.type === "rectangle" || e.type === "diamond" || e.type === "ellipse");
  const allLinear = sel.length > 0 && sel.every((e) => e.type === "line" || e.type === "arrow");
  const sameType = (types: readonly ElementType[]): ElementType | null =>
    sel.length > 0 && sel.every((e) => e.type === sel[0].type) && types.includes(sel[0].type) ? sel[0].type : null;

  return (
    <div className="island panel" aria-label="Properties" data-testid="properties-panel">
      {hasStyle && (
        <section>
          <h3>{t("prop.stroke")}</h3>
          <ColorField label={t("prop.stroke")} value={val("strokeColor")} picks={STROKE_TOP_PICKS} onChange={(c) => set({ strokeColor: c })} testId="stroke-color" eyedropper="stroke" />
        </section>
      )}

      {hasFill && (
        <section>
          <h3>{t("prop.background")}</h3>
          <ColorField
            label={t("prop.background")}
            value={val("backgroundColor")}
            picks={BACKGROUND_TOP_PICKS}
            allowTransparent
            onChange={(c) => set({ backgroundColor: c })}
            testId="background-color"
            eyedropper="background"
          />
        </section>
      )}

      {hasFill && (
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

      {hasStyle && (!has("text") || kinds.size > 1) ? (
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

      {has("line") && (
        <ChoiceRow
          label="Line style"
          testId="line-style"
          value={val("lineCurved")}
          onChange={(v) => set({ lineCurved: v })}
          options={[
            { id: "straight", value: false, title: "Straight", node: <Icon name="straight" size={18} /> },
            { id: "curved", value: true, title: "Curved", node: <Icon name="curved" size={18} /> },
          ]}
        />
      )}

      {has("arrow") && (
        <>
          <ChoiceRow
            label={t("prop.arrowType")}
            testId="arrow-type"
            value={val("arrowType")}
            onChange={(v) => set({ arrowType: v })}
            options={[
              { id: "sharp", value: "sharp" as const, title: "Sharp arrow", node: <Icon name="straight" size={18} /> },
              { id: "round", value: "round" as const, title: "Curved arrow", node: <Icon name="curved" size={18} /> },
              { id: "elbow", value: "elbow" as const, title: "Elbow arrow", node: <Icon name="elbow" size={18} /> },
            ]}
          />
          <section>
            <h3>{t("prop.arrowheads")}</h3>
            <div className="choices">
              <ArrowheadPicker label="Start arrowhead" side="start" value={val("startArrowhead")} onChange={(v) => set({ startArrowhead: v })} testId="arrowhead-start" />
              <ArrowheadPicker label="End arrowhead" side="end" value={val("endArrowhead")} onChange={(v) => set({ endArrowhead: v })} testId="arrowhead-end" />
            </div>
          </section>
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
          {looseTexts.length > 0 && (
            <ChoiceRow
              label={t("prop.textMode")}
              testId="text-mode"
              value={textMode}
              onChange={(m) => setTextMode(store, m)}
              options={[
                { id: "auto", value: "auto" as const, title: "Fit to text", node: <span className="text-choice">Auto</span> },
                { id: "fixed", value: "fixed" as const, title: "Fixed width, wrap text", node: <span className="text-choice">Wrap</span> },
              ]}
            />
          )}
        </>
      )}

      {hasOpacity && (
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
      )}

      {sel.length === 1 && sel[0].type === "image" && (
        <ActionRow label="Image" testId="image-actions">
          <ActionButton name="cropImage" icon="crop" />
        </ActionRow>
      )}
      {sel.length === 1 && sel[0].type === "frame" && <FrameSection id={sel[0].id} name={sel[0].name} />}
      {sel.length === 1 && sel[0].type === "embeddable" && (
        <ActionRow label="Embed" testId="embed-actions">
          <ActionButton name="editEmbedLink" icon="link" />
        </ActionRow>
      )}

      {sel.length > 0 && (
        <>
          {allShapes && (
            <ChoiceRow<ElementType>
              label={t("prop.shapeType")}
              testId="shape-type"
              value={sameType(["rectangle", "diamond", "ellipse"])}
              onChange={(v) => convertSelectedType(store, v)}
              options={[
                { id: "rectangle", value: "rectangle", title: "Rectangle", node: <Icon name="rectangle" size={18} /> },
                { id: "diamond", value: "diamond", title: "Diamond", node: <Icon name="diamond" size={18} /> },
                { id: "ellipse", value: "ellipse", title: "Ellipse", node: <Icon name="ellipse" size={18} /> },
              ]}
            />
          )}
          {allLinear && (
            <ChoiceRow<ElementType>
              label={t("prop.shapeType")}
              testId="linear-type"
              value={sameType(["line", "arrow"])}
              onChange={(v) => convertSelectedType(store, v)}
              options={[
                { id: "line", value: "line", title: "Line", node: <Icon name="line" size={18} /> },
                { id: "arrow", value: "arrow", title: "Arrow", node: <Icon name="arrow" size={18} /> },
              ]}
            />
          )}

          <ActionRow label={t("prop.layers")} testId="layers">
            <ActionButton name="sendToBack" icon="layerBack" />
            <ActionButton name="sendBackward" icon="layerBackward" />
            <ActionButton name="bringForward" icon="layerForward" />
            <ActionButton name="bringToFront" icon="layerFront" />
          </ActionRow>

          {sel.length >= 2 && (
            <ActionRow label={t("prop.align")} testId="align">
              <ActionButton name="align:left" icon="alignLeft" />
              <ActionButton name="align:centerH" icon="alignCenterH" />
              <ActionButton name="align:right" icon="alignRight" />
              <ActionButton name="align:top" icon="alignTop" />
              <ActionButton name="align:centerV" icon="alignCenterV" />
              <ActionButton name="align:bottom" icon="alignBottom" />
              {sel.length >= 3 && (
                <>
                  <ActionButton name="distribute:h" icon="distributeH" />
                  <ActionButton name="distribute:v" icon="distributeV" />
                </>
              )}
            </ActionRow>
          )}

          <ActionRow label={t("prop.actions")} testId="actions">
            <ActionButton name="duplicate" icon="copy" />
            <ActionButton name="delete" icon="trash" />
            <ActionButton name="group" icon="group" />
            <ActionButton name="ungroup" icon="ungroup" />
            <ActionButton name="lock" icon="lock" />
            <ActionButton name="flip:h" icon="flipH" />
            <ActionButton name="flip:v" icon="flipV" />
            <ActionButton name="copyStyle" icon="copyStyle" />
            <ActionButton name="pasteStyle" icon="pasteStyle" />
            {has("line") && <ActionButton name="togglePolygon" icon="polygon" />}
            {looseTexts.length > 0 && <ActionButton name="wrapTextInContainer" icon="wrapText" />}
            <ActionButton name="bindText" icon="bindText" hideWhenDisabled />
            <ActionButton name="unbindText" icon="unbindText" hideWhenDisabled />
            <ActionButton name="wrapInFrame" icon="frame" hideWhenDisabled />
            {sel.some((e) => e.type !== "frame" && e.frameId !== null) && <ActionButton name="removeFromFrame" icon="ungroup" />}
          </ActionRow>
        </>
      )}
    </div>
  );
}
