import { boxCenter, getElementBounds, getLocalBox } from "../geometry/bounds";
import { parseEmbedUrl } from "../embed/embed";
import type { EmbeddableElement } from "../scene/types";
import { activateEmbed } from "../state/rich";
import { useStore, useStoreVersion } from "./StoreContext";

/** At most this many embeds are loaded at once (each is a whole web page). */
const MAX_LIVE = 12;

/**
 * The live pages of the embeds on the canvas, as sandboxed iframes between the scene and the selection overlay.
 * They ignore the mouse until activated ("Click to interact"); pressing on the canvas takes the mouse back.
 */
export function EmbedLayer() {
  const store = useStore();
  useStoreVersion();
  const s = store.state;
  const view = [-s.offsetX / s.zoom, -s.offsetY / s.zoom, (s.width - s.offsetX) / s.zoom, (s.height - s.offsetY) / s.zoom] as const;
  const live = store.scene
    .visible()
    .filter((e): e is EmbeddableElement => e.type === "embeddable" && !!e.link)
    .filter((e) => {
      const b = getElementBounds(e);
      return b[2] >= view[0] && b[0] <= view[2] && b[3] >= view[1] && b[1] <= view[3];
    })
    .slice(0, MAX_LIVE);

  return (
    <div className={`embed-layer${s.activeEmbedId ? " has-active" : ""}`}>
      {live.map((el) => {
        const info = parseEmbedUrl(el.link!);
        if (!info) return null;
        const box = getLocalBox(el);
        const c = boxCenter(box);
        return (
          <div
            key={el.id}
            className={`embed${s.activeEmbedId === el.id ? " active" : ""}`}
            data-testid={`embed-${el.id}`}
            style={{
              left: box.x * s.zoom + s.offsetX,
              top: box.y * s.zoom + s.offsetY,
              width: box.width * s.zoom,
              height: box.height * s.zoom,
              opacity: el.opacity / 100,
              transform: el.angle ? `rotate(${el.angle}rad)` : undefined,
              transformOrigin: `${(c[0] - box.x) * s.zoom}px ${(c[1] - box.y) * s.zoom}px`,
            }}
          >
            <iframe
              src={info.src}
              title={info.label}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation allow-popups-to-escape-sandbox"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        );
      })}
    </div>
  );
}

/** The "Click to interact" button over the selected embed. */
export function EmbedInteractButton() {
  const store = useStore();
  useStoreVersion();
  const s = store.state;
  if (s.selectedIds.length !== 1 || s.activeEmbedId) return null;
  const el = store.scene.get(s.selectedIds[0]);
  if (!el || el.type !== "embeddable" || !el.link || !parseEmbedUrl(el.link)) return null;
  const b = getLocalBox(el);
  return (
    <button
      type="button"
      className="embed-interact"
      data-testid="embed-interact"
      style={{ left: (b.x + b.width) * s.zoom + s.offsetX, top: b.y * s.zoom + s.offsetY - 38 }}
      onClick={() => activateEmbed(store, el.id)}
    >
      Click to interact
    </button>
  );
}
