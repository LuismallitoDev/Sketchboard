import { actionByName } from "../actions";
import { t } from "../i18n";
import { lockedCount, requestClearCanvas, resetZoom, resolveTheme, toggleTheme, unlockAll, zoomBy } from "../state/operations";
import { Icon } from "./icons";
import { useStore, useStoreVersion } from "./StoreContext";

export function Footer() {
  const store = useStore();
  useStoreVersion();
  const { zoom } = store.state;
  const locked = lockedCount(store);
  return (
    <div className="footer">
      <div className="island group" aria-label="Zoom">
        <button type="button" className="btn" title={`${t("action.zoomOut")} — ${actionByName("zoomOut")?.shortcut}`} data-testid="zoom-out" onClick={() => zoomBy(store, 1 / 1.2)}>
          <Icon name="minus" />
        </button>
        <button type="button" className="btn zoom-label" title={t("action.resetZoom")} data-testid="zoom-reset" onClick={() => resetZoom(store)}>
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" className="btn" title={`${t("action.zoomIn")} — ${actionByName("zoomIn")?.shortcut}`} data-testid="zoom-in" onClick={() => zoomBy(store, 1.2)}>
          <Icon name="plus" />
        </button>
      </div>
      <div className="island group" aria-label="History">
        <button
          type="button"
          className="btn"
          title={`${t("action.undo")} — ${actionByName("undo")?.shortcut}`}
          disabled={!store.history.canUndo()}
          data-testid="undo"
          onClick={() => store.undo()}
        >
          <Icon name="undo" />
        </button>
        <button
          type="button"
          className="btn"
          title={`${t("action.redo")} — ${actionByName("redo")?.shortcut}`}
          disabled={!store.history.canRedo()}
          data-testid="redo"
          onClick={() => store.redo()}
        >
          <Icon name="redo" />
        </button>
      </div>
      <div className="island group">
        <button
          type="button"
          className="btn"
          title={`${t("action.clearCanvas")} — ${actionByName("clearCanvas")?.shortcut}`}
          disabled={store.scene.visible().length === 0}
          data-testid="clear-canvas"
          onClick={() => requestClearCanvas(store)}
        >
          <Icon name="trash" />
        </button>
      </div>
      {locked > 0 && (
        <div className="island group">
          <button type="button" className="btn-text" title={`${t("action.unlockAll")} — ${actionByName("unlockAll")?.shortcut}`} data-testid="unlock-all" onClick={() => unlockAll(store)}>
            <Icon name="unlock" size={16} />
            Unlock {locked}
          </button>
        </div>
      )}
    </div>
  );
}

export function ThemeToggle() {
  const store = useStore();
  useStoreVersion();
  const dark = resolveTheme(store.state.theme) === "dark";
  return (
    <div className="topright">
      <button
        type="button"
        className="island btn theme-toggle"
        title={`${dark ? t("theme.light") : t("theme.dark")} — Alt+Shift+D`}
        data-testid="theme-toggle"
        onClick={() => toggleTheme(store)}
      >
        <Icon name={dark ? "sun" : "moon"} />
      </button>
    </div>
  );
}
