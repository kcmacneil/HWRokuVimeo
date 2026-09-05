import { config } from "../config";
import { log } from "../logger";
import { TtlCache } from "../utils/cache";
import { ApiError, mapVimeoStatus } from "../utils/errors";
import {
  Category,
  PagedVideos,
  PlaybackInfo,
  VideoDetails,
  VimeoAlbum,
  VimeoFolder,
  VimeoPage,
  VimeoTextTrack,
  VimeoVideo,
  normalizeAlbum,
  normalizeFolder,
  normalizeVideoDetails,
  normalizeVideoPage,
  parseCategoryId,
  selectStream,
} from "./normalize";

const VIMEO_API = "https://api.vimeo.com";
const ACCEPT = "application/vnd.vimeo.*+json;version=3.4";

// Ask Vimeo for only what we need; keeps payloads small on large libraries.
const LIST_FIELDS =
  "uri,name,description,duration,created_time,release_time,pictures.sizes,tags.name,parent_folder.name,privacy.view,status";
const DETAIL_FIELDS = LIST_FIELDS;
const PLAY_FIELDS = "uri,name,status,privacy.view,play,files";

const metaCache = new TtlCache<unknown>(config.cacheTtlSeconds * 1000);

export interface VimeoClientOptions {
  fetchImpl?: typeof fetch;
}

export class VimeoService {
  private readonly fetchImpl: typeof fetch | null;
  private userIdPromise: Promise<string> | null = null;

  constructor(opts: VimeoClientOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? null;
  }

  isConfigured(): boolean {
    return config.vimeoAccessToken.length > 0;
  }

  // ---- low level -----------------------------------------------------------

  private async request<T>(path: string, context: "video" | "list"): Promise<T> {
    if (!this.isConfigured()) {
      throw new ApiError(503, "NOT_CONFIGURED", "The video service is not configured yet.");
    }
    const url = path.startsWith("http") ? path : `${VIMEO_API}${path}`;
    const started = Date.now();
    let res: Response;
    try {
      const doFetch = this.fetchImpl ?? globalThis.fetch;
      res = await doFetch(url, {
        headers: {
          Authorization: `bearer ${config.vimeoAccessToken}`,
          Accept: ACCEPT,
        },
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      log.error("vimeo request failed", { path, err: String(err) });
      throw new ApiError(502, "VIMEO_UNAVAILABLE", "Vimeo is temporarily unavailable.", true);
    }
    const ms = Date.now() - started;
    if (!res.ok) {
      let detail: unknown = undefined;
      try {
        detail = await res.json();
      } catch {
        /* non-JSON error body */
      }
      // Vimeo errors include "error"/"developer_message"/"error_code"; safe to log.
      log.warn("vimeo error response", { path, status: res.status, ms, detail });
      throw mapVimeoStatus(res.status, context);
    }
    log.debug("vimeo ok", { path, status: res.status, ms, remaining: res.headers.get("x-ratelimit-remaining") });
    return (await res.json()) as T;
  }

  private cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    return metaCache.wrap(key, fn) as Promise<T>;
  }

  private async userPath(): Promise<string> {
    if (config.vimeoUserId) return `/users/${encodeURIComponent(config.vimeoUserId)}`;
    if (!this.userIdPromise) {
      this.userIdPromise = this.request<{ uri: string }>("/me?fields=uri", "list")
        .then((me) => me.uri)
        .catch((e) => {
          this.userIdPromise = null;
          throw e;
        });
    }
    return this.userIdPromise;
  }

  // ---- public API ------------------------------------------------------------

  /** Verifies the token by calling /me. Used by /api/health?deep=1. */
  async checkAuth(): Promise<{ ok: true; account: string; user: string }> {
    const me = await this.request<{ uri: string; name: string; account: string }>(
      "/me?fields=uri,name,account",
      "list",
    );
    return { ok: true, account: me.account, user: me.name };
  }

  async listCategories(): Promise<Category[]> {
    return this.cached("categories", async () => {
      const user = await this.userPath();
      const [folders, albums] = await Promise.all([
        this.safeList<VimeoFolder>(`${user}/projects?per_page=100&fields=uri,name,metadata.connections.videos.total`),
        this.safeList<VimeoAlbum>(
          `${user}/albums?per_page=100&fields=uri,name,pictures.sizes,metadata.connections.videos.total`,
        ),
      ]);
      return [...folders.map(normalizeFolder), ...albums.map(normalizeAlbum)].filter(
        (c) => c.videoCount === null || c.videoCount > 0,
      );
    });
  }

  /** Folders/showcases may be unavailable on some plans; treat as empty rather than failing. */
  private async safeList<T>(path: string): Promise<T[]> {
    try {
      const page = await this.request<VimeoPage<T>>(path, "list");
      return page.data ?? [];
    } catch (err) {
      if (err instanceof ApiError && (err.code === "VIDEO_RESTRICTED" || err.code === "NOT_FOUND")) {
        log.info("category source unavailable", { path, code: err.code });
        return [];
      }
      throw err;
    }
  }

  async listVideos(opts: {
    page: number;
    perPage: number;
    category?: string | null;
    sort?: "date" | "alphabetical" | "duration";
    query?: string | null;
  }): Promise<PagedVideos> {
    const perPage = Math.min(100, Math.max(1, opts.perPage));
    const page = Math.max(1, opts.page);
    const sort = opts.sort ?? "date";
    const key = `videos:${opts.category ?? "all"}:${sort}:${opts.query ?? ""}:${page}:${perPage}`;

    return this.cached(key, async () => {
      const user = await this.userPath();
      const qs = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
        sort,
        direction: sort === "date" ? "desc" : "asc",
        fields: LIST_FIELDS,
      });
      if (opts.query) qs.set("query", opts.query);

      let path: string;
      let categoryName: string | null = null;
      if (opts.category) {
        const parsed = parseCategoryId(opts.category);
        if (!parsed) throw new ApiError(400, "BAD_REQUEST", "Invalid category id.");
        path =
          parsed.kind === "folder"
            ? `${user}/projects/${parsed.id}/videos?${qs}`
            : `${user}/albums/${parsed.id}/videos?${qs}`;
        const cats = await this.listCategories().catch(() => [] as Category[]);
        categoryName = cats.find((c) => c.id === opts.category)?.name ?? null;
      } else {
        path = `${user}/videos?${qs}`;
      }
      const raw = await this.request<VimeoPage<VimeoVideo>>(path, "list");
      return normalizeVideoPage(raw, categoryName);
    });
  }

  async getVideo(id: string): Promise<VideoDetails> {
    return this.cached(`video:${id}`, async () => {
      const raw = await this.request<VimeoVideo>(`/videos/${id}?fields=${DETAIL_FIELDS}`, "video");
      return normalizeVideoDetails(raw);
    });
  }

  /**
   * Always fetched fresh from Vimeo: playback links expire (typically within a
   * few hours) and must never be served from the metadata cache.
   */
  async getPlayback(id: string): Promise<PlaybackInfo> {
    const [raw, tracks] = await Promise.all([
      this.request<VimeoVideo>(`/videos/${id}?fields=${PLAY_FIELDS}`, "video"),
      this.request<VimeoPage<VimeoTextTrack>>(`/videos/${id}/texttracks`, "video").catch(() => null),
    ]);
    if (raw.status && raw.status !== "available") {
      throw new ApiError(409, "VIDEO_UNAVAILABLE", "This video is still processing or unavailable.");
    }
    if (raw.privacy?.view === "nobody") {
      throw new ApiError(
        403,
        "VIDEO_RESTRICTED",
        "This video is set to Private on Vimeo. Change its privacy to Unlisted or Hide from Vimeo to allow playback.",
      );
    }
    const info = selectStream(raw, tracks?.data ?? []);
    if (!info) {
      log.warn("no playable stream", {
        id,
        hasPlay: Boolean(raw.play),
        hasFiles: Boolean(raw.files?.length),
        playStatus: raw.play?.status,
      });
      throw new ApiError(
        404,
        "NO_STREAM",
        "No playable stream is available for this video. Check the Vimeo plan and token scopes.",
      );
    }
    return info;
  }

  clearCache(): void {
    metaCache.clear();
  }
}

export const vimeo = new VimeoService();
