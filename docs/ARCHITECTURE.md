# Architecture

```
┌──────────────┐   HTTPS + bearer token   ┌──────────────────────┐   HTTPS (+X-Api-Key)   ┌──────────────────────┐
│  Vimeo API   │ ◄──────────────────────── │  api/ (Express)      │ ◄──────────────────── │  roku/ (SceneGraph)  │
│ api.vimeo.com│ ────────────────────────► │  Vercel function     │ ────────────────────► │  ApiTask → MainScene │
└──────────────┘   raw Vimeo JSON          └──────────────────────┘   normalized JSON      └──────────┬───────────┘
                                                                                                     │ ContentNode(url=HLS)
                                                                                           ┌─────────▼───────────┐
                                                                                           │  Roku Video node    │──► Vimeo CDN (HLS)
                                                                                           └─────────────────────┘
```

## Middleware (`api/`)

| File | Responsibility |
| --- | --- |
| `api/index.ts` | Vercel entry; exports the Express app. `vercel.json` rewrites `/*` here. |
| `src/server.ts` | Local/self-hosted entry (`npm run dev`). |
| `src/app.ts` | Express wiring: request log, optional API-key guard, routers, JSON 404, sanitized error handler. |
| `src/config.ts` | Typed env loading with bounds. |
| `src/logger.ts` | JSON logs; redacts bearer tokens / the configured secrets. |
| `src/routes/*.ts` | Thin HTTP layer: parse/validate params → service → JSON. |
| `src/services/vimeo.ts` | Vimeo client (`fetch`, 15 s timeout, `fields=` trimming), TTL cache with coalescing for metadata, error mapping. `getPlayback` bypasses the cache. |
| `src/services/normalize.ts` | Pure: Vimeo → Roku shapes, category id encoding, `selectStream` preference order. |
| `src/utils/cache.ts` | `TtlCache` (Map-based, bounded). |
| `src/utils/errors.ts` | `ApiError` + Vimeo HTTP status → stable code mapping. |

Design choices:

* **Normalize at the edge.** Roku receives small, flat objects; Vimeo quirks (`uri` → id,
  picture size arrays, `play` vs `files`) are handled once, server side, and unit-tested.
* **Two cache classes.** Metadata (lists, details, categories) is cached `CACHE_TTL_SECONDS`.
  Playback info is *never* cached and sent with `Cache-Control: no-store` because Vimeo links
  expire.
* **Stateless & serverless-friendly.** No DB. The cache is per warm instance; correctness never
  depends on it.
* **Pagination passthrough.** `/api/videos` maps 1:1 to Vimeo pages so large libraries are
  never fetched at once; Roku asks for `nextPage` as the user scrolls.

## Roku channel (`roku/`)

| File | Responsibility |
| --- | --- |
| `manifest` | Channel metadata, FHD UI, splash/icons. |
| `source/main.brs` | Creates `MainScene`, forwards launch args (deep-link ready). |
| `source/config.brs` | **Single place** for `API_BASE_URL`, `API_KEY`, page size, timeout. |
| `source/utils.brs` | `VideoToContentNode`, duration/date formatting, `FriendlyError`, `LogMsg`. |
| `components/ApiTask` | `Task` node: one HTTPS GET via `roUrlTransfer` off the render thread; emits `{ok,status,data|code,message,tag}`. |
| `components/MainScene` | Screen stack, all API orchestration, loading overlay, error `Dialog`s with Retry, deep-link hook. |
| `components/HomeScreen` | `RowList`: *Recently Added*, *Browse* tiles (All + categories), lazy per-category rows; hero/focus info panel. |
| `components/VideoCard` | Item renderer (16:9 poster, focus ring, duration badge, 2-line title). |
| `components/VideoGrid` | `MarkupGrid` 5×N with incremental paging (`requestPage` when focus nears the end). |
| `components/DetailsScreen` | Artwork, title, meta, description, `ButtonGroup` Play; Play key shortcut. |
| `components/VideoPlayer` | Native `Video`; builds `ContentNode` (`url`, `streamFormat`), buffering overlay, state/error handling, Back closes, captions plumbing via `subtitleTracks`. |

Flow for playback:

1. `DetailsScreen.playRequested` → `MainScene.startPlayback(item)`
2. `ApiTask GET /videos/{id}/play` (fresh URL)
3. `VideoPlayer.playback = response` → `ContentNode.url = streamUrl; streamFormat = "hls"; control = "play"`
4. `state = finished | error` → `closed` / `errorMessage` → `MainScene.popScreen()` (+ dialog on error)

## Extending

| Future feature | Where it plugs in |
| --- | --- |
| Search | `/api/videos?q=` already supported server-side; add a `SearchScreen` with `MiniKeyboard` calling `apiGet("/videos", {q})`. |
| Favorites / watch history / continue watching | `roRegistrySection` on device (or user accounts later); `VideoPlayer.m.lastPosition` is already tracked. |
| Captions | Backend returns `captions[]`; `VideoPlayer` sets `subtitleTracks` – enable and test. |
| Showcases as featured rows | Categories already include `showcase:*`; reorder in `HomeScreen.setContent`. |
| Deep linking / Roku Search | `MainScene.onLaunchArgs` receives `contentId`/`mediaType`; add a feed. |
| Auth / entitlements / accounts | Add middleware in `app.ts` (JWT), Roku sends token header in `ApiTask`. |
| Multiple Vimeo accounts | Instantiate several `VimeoService`s keyed by a `library` query param. |
| Admin-featured content | Add `/api/featured` reading from a JSON/KV store; render as first row. |
