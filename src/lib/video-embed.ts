// Turns a pasted video link into a privacy-friendly embed URL. Only these hosts are allowed.

export interface VideoEmbed {
  provider: "youtube" | "vimeo" | "bunny";
  embedUrl: string;
}

export function parseVideoEmbed(raw: string): VideoEmbed | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\.|^m\./, "");

  if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") {
    const id =
      host === "youtu.be"
        ? url.pathname.slice(1)
        : (url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1]);
    if (!id || !/^[\w-]{6,20}$/.test(id)) return null;
    return { provider: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0` };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = url.pathname.match(/(?:^|\/)(\d{5,12})(?:\/|$)/)?.[1];
    if (!id) return null;
    const hash = url.pathname.match(/\/\d+\/([a-f0-9]{6,})/)?.[1] ?? url.searchParams.get("h");
    if (hash && !/^[a-f0-9]{6,40}$/.test(hash)) return null;
    return {
      provider: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${id}?dnt=1${hash ? `&h=${hash}` : ""}`,
    };
  }

  if (host === "iframe.mediadelivery.net" || host === "player.mediadelivery.net") {
    const m = url.pathname.match(/^\/(?:embed|play)\/(\d+)\/([0-9a-f-]{36})/i);
    if (!m) return null;
    return {
      provider: "bunny",
      embedUrl: `https://iframe.mediadelivery.net/embed/${m[1]}/${m[2]}?preload=false`,
    };
  }

  return null;
}
