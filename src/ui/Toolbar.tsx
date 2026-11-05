import { TOOL_DEFS, actionByName } from "../actions";
import { t } from "../i18n";
import { setTool } from "../state/operations";
import { Icon } from "./icons";
import { useStore, useStoreVersion } from "./StoreContext";

export function Toolbar() {
  const store = useStore();
  useStoreVersion();
  const { tool, toolLocked } = store.state;
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
      {TOOL_DEFS.map((d) => {
        const action = actionByName(`tool:${d.tool}`);
        return (
          <button
            key={d.tool}
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
        );
      })}
    </div>
  );
}
