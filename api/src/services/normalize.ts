/**
 * Pure functions that turn raw Vimeo API payloads into the compact, stable
 * shapes the Roku client consumes. No I/O here so it is fully unit-testable.
 */

// ---- Raw Vimeo shapes (only the fields we read) ---------------------------

export interface VimeoPictureSize {
  width: number;
  height: number;
  link: string;
  link_with_play_button?: string;
}

export interface VimeoPlayFile {
  link: string;
  width?: number;
  height?: number;
  fps?: number;
  link_expiration_time?: string;
  rendition?: string;
  type?: string;
}

export interface VimeoVideo {
  uri: string; // "/videos/123456"
  name: string;
  description: string | null;
  duration: number;
  created_time: string;
  release_time?: string;
  link?: string;
  pictures?: { sizes?: VimeoPictureSize[] };
  privacy?: { view?: string };
  status?: string;
  tags?: { name: string; tag?: string }[];
  play?: {
    status?: string;
    hls?: VimeoPlayFile;
    dash?: VimeoPlayFile;
    progressive?: VimeoPlayFile[];
  };
  files?: {
    quality?: string; // "hls" | "hd" | "sd" | "source"
    type?: string;
    link: string;
    width?: number;
    height?: number;
    fps?: number;
    link_expiration_time?: string;
  }[];
  parent_folder?: { uri: string; name: string } | null;
}

export interface VimeoPaging {
  next: string | null;
  previous: string | null;
  first: string;
  last: string;
}

export interface VimeoPage<T> {
  total: number;
  page: number;
  per_page: number;
  paging: VimeoPaging;
  data: T[];
}

export interface VimeoFolder {
  uri: string; // "/users/{uid}/projects/{pid}"
  name: string;
  created_time?: string;
  modified_time?: string;
  metadata?: { connections?: { videos?: { total?: number } } };
}

export interface VimeoAlbum {
  uri: string; // "/users/{uid}/albums/{aid}"
  name: string;
  description?: string | null;
  created_time?: string;
  pictures?: { sizes?: VimeoPictureSize[] };
  metadata?: { connections?: { videos?: { total?: number } } };
}

export interface VimeoTextTrack {
  uri: string;
  active: boolean;
  type: string; // "subtitles" | "captions"
  language: string;
  link: string;
  name?: string;
}

// ---- Normalized shapes returned to Roku ------------------------------------

export type CategoryKind = "folder" | "showcase";

export interface Category {
  id: string; // "folder:123" | "showcase:456"
  kind: CategoryKind;
  name: string;
  videoCount: number | null;
  thumbnail: string | null;
}

export interface VideoSummary {
  id: string;
  title: string;
  description: string;
  duration: number;
  thumbnail: string | null;
  thumbnailLarge: string | null;
  createdAt: string;
  releaseDate: string | null;
  category: string | null;
  tags: string[];
}

export interface VideoDetails extends VideoSummary {
  privacy: string | null;
  status: string | null;
  playable: boolean;
}

export type StreamFormat = "hls" | "mp4" | "dash";

export interface Caption {
  language: string;
  name: string;
  type: string;
  url: string;
}

export interface PlaybackInfo {
  id: string;
  title: string;
  streamUrl: string;
  streamFormat: StreamFormat;
  expiresAt: string | null;
  alternates: { streamUrl: string; streamFormat: StreamFormat; quality: string }[];
  captions: Caption[];
}

export interface PagedVideos {
  videos: VideoSummary[];
  page: number;
  perPage: number;
  total: number;
  hasMore: boolean;
  nextPage: number | null;
}

// ---- Helpers ----------------------------------------------------------------

const ID_RE = /^\d{1,20}$/;

export function isValidVideoId(id: string): boolean {
  return ID_RE.test(id);
}

export function parseCategoryId(id: string): { kind: CategoryKind; id: string } | null {
  const m = /^(folder|showcase):(\d{1,20})$/.exec(id);
  if (!m) return null;
  return { kind: m[1] as CategoryKind, id: m[2] };
}

export function idFromUri(uri: string): string {
  const parts = uri.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function pickThumb(sizes: VimeoPictureSize[] | undefined, targetWidth: number): string | null {
  if (!sizes || sizes.length === 0) return null;
  // smallest size >= target, else the largest available
  const sorted = [...sizes].sort((a, b) => a.width - b.width);
  const match = sorted.find((s) => s.width >= targetWidth) ?? sorted[sorted.length - 1];
  return match.link ?? null;
}

export function normalizeVideoSummary(v: VimeoVideo, categoryName: string | null = null): VideoSummary {
  return {
    id: idFromUri(v.uri),
    title: v.name ?? "",
    description: (v.description ?? "").trim(),
    duration: Number.isFinite(v.duration) ? Math.round(v.duration) : 0,
    thumbnail: pickThumb(v.pictures?.sizes, 640),
    thumbnailLarge: pickThumb(v.pictures?.sizes, 1280),
    createdAt: v.created_time,
    releaseDate: v.release_time ?? null,
    category: categoryName ?? v.parent_folder?.name ?? null,
    tags: (v.tags ?? []).map((t) => t.name).filter(Boolean),
  };
}

/**
 * Vimeo only issues working playback links for finished uploads whose privacy
 * is not "nobody" ("Private" in the Vimeo UI); everything else 404s at the CDN.
 */
export function isPlayable(v: VimeoVideo): boolean {
  const statusOk = v.status === undefined || v.status === "available";
  const privacyOk = v.privacy?.view === undefined || v.privacy.view !== "nobody";
  return statusOk && privacyOk;
}

export function normalizeVideoDetails(v: VimeoVideo, categoryName: string | null = null): VideoDetails {
  const playable = isPlayable(v);
  return {
    ...normalizeVideoSummary(v, categoryName),
    privacy: v.privacy?.view ?? null,
    status: v.status ?? null,
    playable,
  };
}

export function normalizeVideoPage(
  page: VimeoPage<VimeoVideo>,
  categoryName: string | null = null,
): PagedVideos {
  const hasMore = page.paging?.next != null;
  return {
    videos: page.data.filter(isPlayable).map((v) => normalizeVideoSummary(v, categoryName)),
    page: page.page,
    perPage: page.per_page,
    total: page.total,
    hasMore,
    nextPage: hasMore ? page.page + 1 : null,
  };
}

export function normalizeFolder(f: VimeoFolder): Category {
  return {
    id: `folder:${idFromUri(f.uri)}`,
    kind: "folder",
    name: f.name,
    videoCount: f.metadata?.connections?.videos?.total ?? null,
    thumbnail: null,
  };
}

export function normalizeAlbum(a: VimeoAlbum): Category {
  return {
    id: `showcase:${idFromUri(a.uri)}`,
    kind: "showcase",
    name: a.name,
    videoCount: a.metadata?.connections?.videos?.total ?? null,
    thumbnail: pickThumb(a.pictures?.sizes, 640),
  };
}

export function normalizeCaptions(tracks: VimeoTextTrack[] | undefined): Caption[] {
  return (tracks ?? [])
    .filter((t) => t.active && t.link)
    .map((t) => ({
      language: t.language,
      name: t.name ?? t.language,
      type: t.type,
      url: t.link,
    }));
}

/**
 * Choose the best Roku-compatible stream. Preference:
 *   1. HLS from `play.hls`
 *   2. HLS from `files[]` (quality === "hls")
 *   3. Highest-resolution progressive MP4
 *   4. DASH (Roku supports DASH but HLS is far better tested with Vimeo)
 * Returns null when Vimeo exposes no playable link (typically an account tier
 * or scope problem – see README "Vimeo requirements").
 */
export function selectStream(v: VimeoVideo, captions: VimeoTextTrack[] = []): PlaybackInfo | null {
  const alternates: PlaybackInfo["alternates"] = [];
  let primary: { url: string; format: StreamFormat; expires: string | null } | null = null;

  const consider = (url: string | undefined, format: StreamFormat, quality: string, expires?: string) => {
    if (!url || !/^https:\/\//i.test(url)) return;
    if (!primary) primary = { url, format, expires: expires ?? null };
    else alternates.push({ streamUrl: url, streamFormat: format, quality });
  };

  consider(v.play?.hls?.link, "hls", "adaptive", v.play?.hls?.link_expiration_time);

  const hlsFile = (v.files ?? []).find((f) => f.quality === "hls");
  consider(hlsFile?.link, "hls", "adaptive", hlsFile?.link_expiration_time);

  const progressive = [
    ...(v.play?.progressive ?? []),
    ...(v.files ?? []).filter((f) => f.quality !== "hls" && (f.type ?? "").includes("mp4")),
  ].sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  for (const p of progressive) {
    consider(p.link, "mp4", `${p.height ?? "?"}p`, p.link_expiration_time);
  }

  consider(v.play?.dash?.link, "dash", "adaptive", v.play?.dash?.link_expiration_time);

  if (!primary) return null;
  const chosen: { url: string; format: StreamFormat; expires: string | null } = primary;
  return {
    id: idFromUri(v.uri),
    title: v.name ?? "",
    streamUrl: chosen.url,
    streamFormat: chosen.format,
    expiresAt: chosen.expires,
    alternates,
    captions: normalizeCaptions(captions),
  };
}
