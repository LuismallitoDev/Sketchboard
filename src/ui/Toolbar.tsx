import { useCallback, useRef, useState } from "react";
import { PICK_IMAGE_EVENT, TOOL_DEFS, actionByName } from "../actions";
import { t } from "../i18n";
import { setTool } from "../state/operations";
import { Icon } from "./icons";
import { Popover } from "./Popover";
import { useStore, useStoreVersion } from "./StoreContext";

const MAIN = TOOL_DEFS.filter((d) => d.group !== "more");
const MORE = TOOL_DEFS.filter((d) => d.group === "more");

export function Toolbar() {
  const store = useStore();
  useStoreVersion();
  const { tool, toolLocked } = store.state;
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const moreActive = MORE.some((d) => d.tool === tool);

  return (
    <div className="island toolbar" role="toolbar" aria-label="Tools">
      <button
        type="button"
        className="btn"
        aria-pressed={toolLocked}
        title={`${t("tool.lock")} — Q`}
        data-testid="tool-lock"
        onClick={() => actionByName("toolLock")?.perform(store)}
      >
        <Icon name={toolLocked ? "lock" : "unlock"} />
      </button>
      <span className="sep" />
      {MAIN.map((d) => {
        const action = actionByName(`tool:${d.tool}`);
        return (
          <span key={d.tool} className="tool-slot">
            <button
              type="button"
              className="btn tool"
              aria-pressed={tool === d.tool}
              title={`${t(d.label)} — ${action?.shortcut ?? ""}`}
              data-tool={d.tool}
              data-testid={`tool-${d.tool}`}
              onClick={() => setTool(store, d.tool)}
            >
              <Icon name={d.tool} />
              {d.digit && <kbd>{d.digit}</kbd>}
            </button>
            {d.tool === "text" && (
              // Not a tool that stays on: it opens the file picker and puts the picture on the canvas.
              <button
                type="button"
                className="btn tool"
                title={`${t("tool.image")} — 9`}
                data-testid="tool-image"
                onClick={() => window.dispatchEvent(new CustomEvent(PICK_IMAGE_EVENT))}
              >
                <Icon name="image" />
                <kbd>9</kbd>
              </button>
            )}
          </span>
        );
      })}
      <span className="sep" />
      <button
        ref={moreRef}
        type="button"
        className="btn"
        aria-pressed={moreActive}
        aria-expanded={moreOpen}
        title={t("tool.more")}
        data-testid="tools-more"
        onClick={() => setMoreOpen((o) => !o)}
      >
        <Icon name="more" />
      </button>
      {moreOpen && (
        <Popover anchor={moreRef} onClose={closeMore} label={t("tool.more")} testId="tools-more-menu">
          <div className="tool-menu">
            {MORE.map((d) => (
              <button
                key={d.tool}
                type="button"
                className="menu-item"
                aria-pressed={tool === d.tool}
                data-testid={`tool-${d.tool}`}
                onClick={() => {
                  setTool(store, d.tool);
                  closeMore();
                }}
              >
                <Icon name={d.tool} size={18} />
                <span>{t(d.label)}</span>
                <kbd>{d.letter.toUpperCase()}</kbd>
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}
