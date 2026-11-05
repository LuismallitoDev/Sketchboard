/**
 * Websites that may be embedded. Only these (over https) are accepted, and each address is rewritten to the form
 * the service allows inside an iframe. Anything else is refused, so an embed can never point at an arbitrary site.
 */

export type EmbedService = "youtube" | "vimeo" | "figma" | "codepen" | "google-maps" | "google-docs" | "google-slides" | "google-sheets";

export interface EmbedInfo {
  /** The address to load in the iframe. */
  src: string;
  service: EmbedService;
  label: string;
}

/** Hosts an embed iframe may load from (for the page's frame-src policy). */
export const EMBED_FRAME_HOSTS = [
  "https://www.youtube.com",
  "https://player.vimeo.com",
  "https://www.figma.com",
  "https://codepen.io",
  "https://www.google.com",
  "https://maps.google.com",
  "https://docs.google.com",
] as const;

const LABELS: Record<EmbedService, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  figma: "Figma",
  codepen: "CodePen",
  "google-maps": "Google Maps",
  "google-docs": "Google Docs",
  "google-slides": "Google Slides",
  "google-sheets": "Google Sheets",
};

const ok = (service: EmbedService, src: string): EmbedInfo => ({ service, src, label: LABELS[service] });

/** "90", "1m30s", "1h2m3s" to seconds. */
function seconds(t: string | null): number | null {
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

function youtube(u: URL, host: string): EmbedInfo | null {
  const id = /^[\w-]{11}$/;
  let video: string | null = null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") video = parts[0] ?? null;
  else if (parts[0] === "watch") video = u.searchParams.get("v");
  else if (["embed", "shorts", "live", "v"].includes(parts[0] ?? "")) video = parts[1] ?? null;

  const list = u.searchParams.get("list");
  if (video && id.test(video)) {
    const start = seconds(u.searchParams.get("t") ?? u.searchParams.get("start"));
    return ok("youtube", `https://www.youtube.com/embed/${video}${start ? `?start=${start}` : ""}`);
  }
  if (list && /^[\w-]+$/.test(list) && (parts[0] === "playlist" || parts[1] === "videoseries")) {
    return ok("youtube", `https://www.youtube.com/embed/videoseries?list=${list}`);
  }
  return null;
}

function googleMaps(u: URL): EmbedInfo | null {
  if (u.pathname.startsWith("/maps/embed")) return ok("google-maps", `https://www.google.com${u.pathname}${u.search}`);
  let query = u.searchParams.get("q");
  const place = /^\/maps\/place\/([^/]+)/.exec(u.pathname);
  if (!query && place) query = decodeURIComponent(place[1].replace(/\+/g, " "));
  if (!query) return null;
  return ok("google-maps", `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`);
}

function googleDocs(u: URL): EmbedInfo | null {
  const m = /^\/(document|presentation|spreadsheets)\/d\/(e\/)?([\w-]+)/.exec(u.pathname);
  if (!m) return null;
  const [, kind, published, id] = m;
  const base = `https://docs.google.com/${kind}/d/${published ?? ""}${id}`;
  if (kind === "presentation") return ok("google-slides", `${base}/embed?start=false&loop=false&delayms=3000`);
  if (kind === "spreadsheets") return ok("google-sheets", published ? `${base}/pubhtml?widget=true&headers=false` : `${base}/preview`);
  return ok("google-docs", published ? `${base}/pub?embedded=true` : `${base}/preview`);
}

/** Checks an address against the allowlist and rewrites it to its embeddable form (null when it is not allowed). */
export function parseEmbedUrl(input: string): EmbedInfo | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");

  if (["youtube.com", "m.youtube.com", "youtu.be", "youtube-nocookie.com"].includes(host)) return youtube(u, host);

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = /^\/(?:video\/)?(\d+)/.exec(u.pathname);
    return m ? ok("vimeo", `https://player.vimeo.com/video/${m[1]}`) : null;
  }

  if (host === "figma.com") {
    if (!/^\/(file|design|proto|board|slides)\//.test(u.pathname)) return null;
    return ok("figma", `https://www.figma.com/embed?embed_host=sketchboard&url=${encodeURIComponent(u.toString())}`);
  }

  if (host === "codepen.io") {
    const m = /^\/([\w-]+)\/(?:pen|full|details|embed)\/([\w-]+)/.exec(u.pathname);
    return m ? ok("codepen", `https://codepen.io/${m[1]}/embed/${m[2]}?default-tab=result`) : null;
  }

  if (host === "google.com" || host === "maps.google.com") return u.pathname.startsWith("/maps") ? googleMaps(u) : null;
  if (host === "docs.google.com") return googleDocs(u);
  return null;
}
