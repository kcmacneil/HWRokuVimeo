# Vimeo setup

## 1. Check your plan

Roku needs direct HLS (or MP4) URLs. Vimeo only exposes those through the API
(`play` and `files` fields) for **paid** plans – Standard, Advanced, Enterprise (older names:
Plus*, Pro, Business, Premium). Free and Starter accounts do not return file links, and the
`/api/videos/:id/play` endpoint will respond with `NO_STREAM`.

\* Plus accounts historically did not include `files` access – if you are on Plus, test
`/api/videos/:id/play` early.

## 2. Create a Vimeo API app

1. Sign in and go to <https://developer.vimeo.com/apps>.
2. **Create an app**. Name it e.g. `HW Roku Channel`; the app URL can be your website.
3. Accept the API terms.

## 3. Generate a personal access token

On the app page under **Authentication → Generate an access token**:

* **Authenticated (you)** – choose this, not "Unauthenticated".
* Scopes: tick **`public`**, **`private`**, and **`video_files`**.
  * `private` – lets the API list your private/unlisted videos, folders and showcases.
  * `video_files` – required to receive `play` / `files` links (the HLS URL).
  * Do **not** tick `edit`, `delete`, `upload`, etc. – the middleware is read-only.
* Click **Generate**, copy the token once (it is shown only once).

If the `video_files` checkbox is missing, your plan does not include file access – see step 1.

## 4. Find your user id (optional)

The middleware calls `/me` to discover the account, so `VIMEO_USER_ID` is optional. To pin it
(useful for team accounts), copy the numeric id from `https://api.vimeo.com/me` (use the
"Try it out" button on <https://developer.vimeo.com/api/reference/users#get_user>) – it is the
`uri` field, `/users/<id>`.

## 5. Video privacy settings

The token acts as *you*, so any video you can watch will play. Recommended for a Roku-only
library:

| Setting | Value | Why |
| --- | --- | --- |
| Who can watch | **Hide from Vimeo** (or Unlisted) | Keeps videos off vimeo.com but reachable via the API |
| Where can this be embedded | Anywhere or Nowhere – irrelevant | Roku uses HLS, not embeds |
| Download | off | Not needed; `video_files` scope is independent of the "download" toggle |

Avoid **Password** privacy unless you want to manage passwords elsewhere; the API still
returns links for the token owner but Vimeo may restrict them in the future.

## 6. Configure environment variables

Local development – create `api/.env` (git-ignored):

```
VIMEO_ACCESS_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VIMEO_USER_ID=
API_KEY=
```

Vercel – *Project → Settings → Environment Variables* (Production + Preview), or CLI:

```bash
cd api
npx vercel env add VIMEO_ACCESS_TOKEN production
```

## 7. Verify

```bash
cd api && npm run dev
curl "http://localhost:3000/api/health?deep=1"
# → {"status":"ok","vimeoConfigured":true,"vimeo":{"ok":true,"account":"pro","user":"…"}}

curl "http://localhost:3000/api/videos?perPage=3"
curl "http://localhost:3000/api/videos/<id>/play"
# → {"streamUrl":"https://player.vimeo.com/…/playlist.m3u8","streamFormat":"hls",…}
```

## Organizing videos into categories

The Roku home screen builds a "Browse" row and preview rows from:

* **Folders** (Vimeo "Projects" in the API) → `folder:<id>`
* **Showcases** (Albums) → `showcase:<id>`

Both are optional. Empty ones are hidden. Rename/reorder them in Vimeo and the Roku app follows
within `CACHE_TTL_SECONDS`.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `VIMEO_AUTH_FAILED` from `/api/health?deep=1` | Token wrong, revoked, or pasted with whitespace. Regenerate. |
| `/api/videos` works but `/play` gives `NO_STREAM` | Plan lacks file access or token lacks `video_files`. Check `LOG_LEVEL=debug` output: `hasPlay:false,hasFiles:false`. |
| `VIDEO_RESTRICTED` for some videos | Video privacy prevents the token owner from viewing (team-owned/private link). |
| `VIMEO_RATE_LIMITED` | Too many requests; increase `CACHE_TTL_SECONDS`. |
| Folders missing | Token needs `private` scope; team folders require the token owner to be a member. |
