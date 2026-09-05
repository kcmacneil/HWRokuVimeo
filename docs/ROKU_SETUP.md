# Roku developer setup & sideloading

## 1. Enable Developer Mode on the Roku

On the Roku remote press, in order:

**Home ×3, Up ×2, Right, Left, Right, Left, Right**

The *Developer Settings* screen appears. Choose **Enable installer and restart**, accept the
SDK license, and set a **developer password** (you'll need it below). The device reboots.

## 2. Find the Roku's IP address

*Settings → Network → About* on the Roku, or read it from the Developer Settings screen.
Example: `192.168.1.42`.

## 3. Open the Development Application Installer

In a browser on the same network: `http://192.168.1.42` – user `rokudev`, password = your
developer password.

## 4. Configure the app

Edit `roku/source/config.brs`:

```brightscript
API_BASE_URL: "https://<your-project>.vercel.app/api"
API_KEY: ""      ' or the same value as the server's API_KEY
```

## 5. Build the ZIP

```bash
npm install            # repo root – installs brighterscript
npm run roku:lint      # static checks
npm run roku:package   # -> roku/out/HWVimeo.zip
```

Without Node you can also zip **the contents** of `roku/` (manifest, source/, components/,
images/) – the `manifest` file must be at the root of the ZIP, not inside a folder.

## 6. Sideload

**Option A – browser:** on the installer page click *Upload*, select `roku/out/HWVimeo.zip`,
click *Install*. The channel launches automatically.

**Option B – CLI:**

```bash
ROKU_DEV_TARGET=192.168.1.42 ROKU_DEV_PASSWORD=yourpass npm run roku:deploy
```

(PowerShell: `$env:ROKU_DEV_TARGET="192.168.1.42"; $env:ROKU_DEV_PASSWORD="yourpass"; npm run roku:deploy`)

Only one sideloaded channel can exist at a time; installing replaces the previous one.

## 7. Debug output

Telnet to port **8085** for the BrightScript console (prints, crashes, `LogMsg(...)` lines):

```bash
telnet 192.168.1.42 8085
```

Useful lines you'll see:

```
[HWVimeo] GET https://…/api/videos?page=1&perPage=20
[HWVimeo] <- 200 (412ms)
[HWVimeo] play {"url":"https://player.vimeo.com/…m3u8","format":"hls"}
[HWVimeo] video state: buffering / playing / finished
```

Port 8080 offers extra tools (`sgnodes all`, `loaded_textures`, etc.), and the installer page
has a *Utilities* tab for screenshots and profiling.

## 8. Test playback

1. Home screen loads with thumbnails from your Vimeo library.
2. Press **OK** on a video → details screen. Press **OK** on *Play* (or the **Play** key).
3. The spinner shows briefly, then HLS playback starts. Try **Play/Pause**, **◄◄ / ►►**
   (trick play bar), **Back** (returns to details).
4. Watch the debug console for `video state:` transitions; on failure it prints
   `video error {"code":-3,…}` and the app shows a friendly dialog.

## Common issues

| Symptom | Fix |
| --- | --- |
| "Can't reach the video service" | `API_BASE_URL` wrong / not deployed / Roku offline. Confirm `curl https://…/api/health` from a laptop. |
| "The video service hasn't been set up yet" | `VIMEO_ACCESS_TOKEN` missing on the server. |
| "This channel isn't authorized…" | `API_KEY` mismatch between server and `config.brs`. |
| Playback error -3 immediately | Stream URL expired/unsupported – retry; check `/play` returns `streamFormat: "hls"`. |
| Certificate errors in console | Backend must be HTTPS with a public CA (Vercel is). Self-signed certs won't work on Roku. |
| Installer says "Failed to install" | ZIP must contain `manifest` at the root; check the manifest has no blank first line. |
