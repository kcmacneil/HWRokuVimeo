# HW Roku Vimeo

A Roku SceneGraph channel that browses and streams a Vimeo library through a small, secure
middleware API. Vimeo credentials never leave the server; the Roku app talks only to the middleware.

```
Vimeo account ──► Vimeo API ──► api/ (Node + Express on Vercel) ──► roku/ (SceneGraph) ──► Roku Video node
```

| Part | Path | Stack |
| --- | --- | --- |
| Middleware API | [`api/`](api) | Node 18+, TypeScript, Express, Vitest, deployable to Vercel |
| Roku channel | [`roku/`](roku) | SceneGraph, BrightScript, XML, `Video` + `ContentNode` |
| Docs | [`docs/`](docs) | Vimeo setup, Roku sideloading, architecture, testing |

## Quick start

### 1. Vimeo credentials

Follow [docs/VIMEO_SETUP.md](docs/VIMEO_SETUP.md). You need a personal access token with
`public private video_files` scopes on a Vimeo plan that exposes video file links (see
[limitations](#known-vimeoroku-limitations)).

### 2. Run the API locally

```bash
cd api
cp .env.example .env          # fill in VIMEO_ACCESS_TOKEN (and optionally VIMEO_USER_ID)
npm install
npm run dev                   # http://localhost:3000
curl http://localhost:3000/api/health?deep=1
curl "http://localhost:3000/api/videos?perPage=5"
```

Tests / lint / typecheck:

```bash
npm test
npm run lint && npm run typecheck
```

### 3. Deploy the API to Vercel

**Current production deployment:** `https://hw-roku-vimeo-api.vercel.app/api`
(Vercel project `hw-roku-vimeo-api`, team `kcmacn-8344s-projects`). Redeploy with
`cd api && npx vercel --prod`.

To deploy a fresh project:

```bash
cd api
npx vercel login
npx vercel link                # create a new project, root = api/
npx vercel env add VIMEO_ACCESS_TOKEN production
npx vercel env add VIMEO_USER_ID production      # optional
npx vercel env add API_KEY production            # optional shared secret
npx vercel --prod
```

Or in the Vercel dashboard: *New Project → import this repo → Root Directory = `api`* and add
the environment variables under *Settings → Environment Variables*. `api/vercel.json` rewrites
every path to the single Express function in `api/api/index.ts`.

Verify: `https://<project>.vercel.app/api/health?deep=1` should return
`{"status":"ok","vimeoConfigured":true,"vimeo":{"ok":true,...}}`.

### 4. Point the Roku app at the API and sideload it

1. `roku/source/config.brs` already points at the production API above; change `API_BASE_URL`
   if you deploy elsewhere (and `API_KEY` if you set one on the server).
2. Package: `npm install` (repo root) then `npm run roku:package` → `roku/out/HWVimeo.zip`.
3. Sideload: see [docs/ROKU_SETUP.md](docs/ROKU_SETUP.md) (developer mode, installer page,
   `npm run roku:deploy`, debug console on port 8085).

## Environment variables

Set these on Vercel (or in `api/.env` locally). Never commit `.env`.

| Variable | Required | Description |
| --- | --- | --- |
| `VIMEO_ACCESS_TOKEN` | **yes** | Vimeo personal access token (scopes: `public private video_files`). |
| `VIMEO_USER_ID` | no | Numeric Vimeo user id. Defaults to the token owner (`/me`). |
| `API_KEY` | no | Shared secret; when set, Roku must send `X-Api-Key`. Set the same value in `roku/source/config.brs`. |
| `CACHE_TTL_SECONDS` | no | Metadata cache TTL (default 300). Playback URLs are never cached. |
| `PAGE_SIZE` | no | Default page size for `/api/videos` (default 50, max 100). |
| `LOG_LEVEL` | no | `debug` \| `info` \| `warn` \| `error` (default `info`). |
| `PORT` | no | Local dev port (default 3000). Ignored on Vercel. |

Roku-side configuration lives in one file: `roku/source/config.brs` (`API_BASE_URL`, `API_KEY`,
`PAGE_SIZE`, `REQUEST_TIMEOUT_MS`).

## API

All responses are JSON. Errors have the shape
`{ "error": { "code": "VIDEO_RESTRICTED", "message": "...", "retryable": false } }` – the Roku
app maps `code` to friendly text and never shows raw Vimeo errors.

| Endpoint | Description |
| --- | --- |
| `GET /api/health` | Liveness + whether Vimeo is configured. `?deep=1` also calls Vimeo `/me`. |
| `GET /api/categories` | Vimeo folders (`folder:<id>`) and showcases (`showcase:<id>`) that contain videos. |
| `GET /api/videos?page=1&perPage=50&category=folder:123&sort=date&q=text` | Paged, normalized video list: `{ videos, page, perPage, total, hasMore, nextPage }`. |
| `GET /api/videos/:id` | Details for one video (adds `privacy`, `status`, `playable`). |
| `GET /api/videos/:id/play` | **Fresh** playback info: `{ id, title, streamUrl, streamFormat, expiresAt, alternates[], captions[] }`. `Cache-Control: no-store`. |

Video object:

```json
{
  "id": "123456789",
  "title": "Example Lecture",
  "description": "…",
  "duration": 1800,
  "thumbnail": "https://i.vimeocdn.com/…640.jpg",
  "thumbnailLarge": "https://i.vimeocdn.com/…1280.jpg",
  "createdAt": "2024-01-02T03:04:05+00:00",
  "releaseDate": "2024-01-03T00:00:00+00:00",
  "category": "Lectures",
  "tags": ["physics"]
}
```

Error codes: `NOT_CONFIGURED`, `UNAUTHORIZED`, `BAD_REQUEST`, `NOT_FOUND`, `VIDEO_UNAVAILABLE`,
`VIDEO_RESTRICTED`, `NO_STREAM`, `VIMEO_AUTH_FAILED`, `VIMEO_RATE_LIMITED`, `VIMEO_UNAVAILABLE`,
`INTERNAL`. The Roku client adds `NETWORK`, `TIMEOUT`, `BAD_RESPONSE` for local failures.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). In short:

* **`api/src/services/normalize.ts`** – pure functions converting Vimeo JSON to the Roku
  shapes above and choosing the best stream (HLS → `files[hls]` → MP4 → DASH). Fully unit-tested.
* **`api/src/services/vimeo.ts`** – authenticated Vimeo client, in-memory TTL cache for
  metadata, request coalescing, error mapping. Playback lookups bypass the cache.
* **`api/src/app.ts`** – Express app, optional `X-Api-Key` guard, sanitized error handler,
  structured logs with token redaction.
* **`roku/components/MainScene`** – screen stack (Home → Grid → Details → Player), owns all
  network calls via `ApiTask` (a `Task` node, so nothing blocks the render thread), loading
  overlay and error dialogs.
* **`HomeScreen`** (RowList: Recently Added / Browse tiles / per-category rows),
  **`VideoGrid`** (MarkupGrid with infinite paging), **`DetailsScreen`**, **`VideoPlayer`**
  (native `Video` node, dynamic `ContentNode`, HLS, error/finish handling, captions plumbing).
* **Autoplay next** – when a video ends the player shows an "Up next" card for the following
  video in the same row/collection with a countdown (OK plays now, Back cancels) and then
  fetches a fresh stream for it. Tune/disable via `AUTOPLAY_NEXT` and
  `AUTOPLAY_COUNTDOWN_SECONDS` in `roku/source/config.brs`.

## Security

* Vimeo token only exists as a server env var; the Roku package contains no secrets.
* HTTPS only (Roku uses the system CA bundle; Vercel is HTTPS by default).
* Video ids validated (`^\d{1,20}$`), category ids validated (`folder:<digits>` / `showcase:<digits>`).
* Vimeo errors are mapped to stable codes; bodies are logged server-side only, with any token
  strings redacted.
* Optional `API_KEY` shared secret stops casual third-party use of the middleware.
* `.env` is git-ignored.

## Testing

See [docs/TESTING.md](docs/TESTING.md) for the full manual + automated checklist. Automated:
`cd api && npm test` (26 tests covering normalization, stream selection, pagination, id
validation, error mapping, caching, and the no-cache rule for playback URLs).

## Known Vimeo/Roku limitations

* **Playback links require a paid Vimeo plan.** Vimeo only returns `play`/`files` links (the
  direct HLS/MP4 URLs Roku needs) for accounts on Standard/Advanced/Enterprise (formerly
  Pro/Business/Premium) plans, with the `video_files` scope. On Free/Starter accounts
  `/api/videos/:id/play` returns `NO_STREAM`. Vimeo embed players cannot be used on Roku.
* **Vimeo playback URLs expire** (Vimeo documents `link_expiration_time`; typically hours).
  The app therefore requests a fresh URL on every Play, and the API never caches them.
* **Private videos** are fine as long as the token owner can view them ("Only me", "Hide from
  Vimeo", "Unlisted"). Password-protected videos still return links via the API, but any
  privacy setting that the token owner cannot access yields `VIDEO_RESTRICTED`.
* **Folders/showcases** need the token to have `private` scope; the API silently returns an
  empty category list if Vimeo denies access, so the home screen still works.
* **Rate limits** – Vimeo allows roughly 250 requests/minute for authenticated apps. The
  metadata cache (default 5 min) plus request coalescing keeps Roku traffic well under that;
  per-lambda caches on Vercel mean cold starts refetch.
* **Captions** – Vimeo text tracks are passed through as WebVTT URLs and wired into
  `ContentNode.subtitleTracks`, but haven't been verified on-device yet (not part of MVP).
* **Channel Store** – artwork in `roku/images/` is generated placeholder art
  (`node roku/tools/gen-images.js`); replace with real branding, and add a `roku/` privacy
  policy + Roku Search/Deep Linking before submission.

## MVP checklist

| # | Requirement | Status |
| --- | --- | --- |
| 1 | Backend authenticates with Vimeo | **Verified live** (`/api/health?deep=1` → `live_premium` account) |
| 2 | `/api/videos` returns Vimeo library metadata | **Verified live** (1,200+ videos, folders + showcase, pagination, per-folder filtering) |
| 3 | Roku app loads catalog from backend | Implemented (`ApiTask` → `MainScene.loadHome`) |
| 4 | Home screen shows thumbnails and titles | Implemented (`HomeScreen` RowList + `VideoCard`) |
| 5 | Remote navigation | Implemented (RowList/MarkupGrid/ButtonGroup focus, visible focus ring) |
| 6 | Selecting a video opens details | Implemented (`DetailsScreen`) |
| 7 | Play retrieves a fresh stream URL | **Verified live** (`/play` returns an HLS `.m3u8` that the Vimeo CDN serves; `no-store`, never cached) |
| 8 | `Video` node plays Vimeo HLS | Implemented; stream URL verified reachable; playback not yet verified on a physical Roku |
| 9 | Back button returns cleanly | Implemented (screen stack in `MainScene`) |
| 10 | Graceful errors | Implemented (error codes → friendly dialogs with Retry; player error handling) |

Items 3–6, 8–10 need a Roku device to flip to "verified" – see the STATUS summary in the PR
description.
