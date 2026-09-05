# Testing

## Automated (backend)

```bash
cd api
npm test            # vitest – 26 tests
npm run lint
npm run typecheck
```

`src/__tests__/normalize.test.ts` – pure normalization: field mapping, thumbnail size choice,
pagination flags, category id parsing, video id validation, stream preference (HLS → files[hls]
→ MP4 → DASH), captions filtering, rejection of non-HTTPS links.

`src/__tests__/api.test.ts` – boots the Express app against a stubbed Vimeo API: health
(shallow/deep), auth failure without token leakage, list + paging, category filtering, id
validation, 404/403/500 mapping, metadata caching, playback `no-store` + never cached,
`NO_STREAM`, JSON 404s.

## Manual – backend with real Vimeo credentials

| Test | Command | Expect |
| --- | --- | --- |
| Health | `curl $API/health` | `{"status":"ok","vimeoConfigured":true}` |
| Vimeo auth | `curl "$API/health?deep=1"` | `vimeo.ok: true`, your account name |
| Video list | `curl "$API/videos?perPage=5"` | 5 videos, `total`, `hasMore` |
| Pagination | `curl "$API/videos?perPage=5&page=2"` | different videos, `page: 2`, `nextPage` |
| Categories | `curl $API/categories` | folders/showcases with `videoCount` |
| Category filter | `curl "$API/videos?category=folder:<id>"` | only that folder's videos, `category` name set |
| Thumbnails | open a `thumbnail` URL | JPEG loads |
| Metadata | `curl $API/videos/<id>` | title, description, duration, privacy, playable |
| Playback URL | `curl $API/videos/<id>/play` | `streamFormat: "hls"`, `.m3u8` URL; `ffprobe`/VLC can open it |
| Invalid id | `curl $API/videos/abc` | 400 `BAD_REQUEST` |
| Unknown id | `curl $API/videos/1/play` | 404 `VIDEO_UNAVAILABLE` |
| Bad token | set a wrong token, `?deep=1` | 502 `VIMEO_AUTH_FAILED`, token not in body/logs |
| API key | set `API_KEY`, call without header | 401 `UNAUTHORIZED`; with header → 200 |

## Manual – Roku

Sideload per [ROKU_SETUP.md](ROKU_SETUP.md), keep `telnet <ip> 8085` open.

| # | Test | Steps | Expect |
| --- | --- | --- | --- |
| R1 | Loading screen | Launch | Splash → "Loading your library…" spinner → home |
| R2 | Home content | – | Recently Added row with thumbnails/titles/duration badges; Browse row with *All Videos* + categories; category rows fill in |
| R3 | Remote navigation | ←/→ within row, ↑/↓ between rows | Blue focus ring moves; hero/title/description update |
| R4 | Details | OK on a video | Artwork, title, duration • date, category, description, focused *Play* button |
| R5 | HLS playback | OK on Play (or Play key) | "Starting playback…" → video plays; console shows `video state: playing` |
| R6 | Pause/resume/seek | Play/Pause, ◄◄/►► | Native trick-play bar works |
| R7 | End of video | Let it finish (or seek to end) | Returns to details screen |
| R8 | Back | Back from player → details → grid/home → Back at home | Each Back pops one screen; at home the channel exits |
| R9 | Library grid + paging | Browse → *All Videos*, scroll down repeatedly | "x of N videos" grows; more pages load before reaching the end |
| R10 | Category grid | Browse → a category | Only that category's videos |
| R11 | Network error | Set `API_BASE_URL` to an unreachable host, launch | Dialog "Can't reach the video service…" with *Try again* |
| R12 | Backend error | Remove `VIMEO_ACCESS_TOKEN` on the server | Dialog "The video service hasn't been set up yet." |
| R13 | Invalid/unavailable video | Delete a video on Vimeo, play it from a cached list | Dialog "This video is no longer available." |
| R14 | Thumbnail failure | Block `i.vimeocdn.com` | Placeholder artwork shown, UI still navigable |
| R15 | Expired stream | Leave details open > link lifetime, press Play | Still plays (fresh URL fetched on Play) |

Record results in the PR / release notes.
