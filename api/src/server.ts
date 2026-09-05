// Local / self-hosted entry point. Vercel uses api/index.ts instead.
import { createApp } from "./app";
import { config } from "./config";
import { log } from "./logger";

const app = createApp();
app.listen(config.port, () => {
  log.info("listening", { port: config.port, vimeoConfigured: config.vimeoAccessToken.length > 0 });
  if (!config.vimeoAccessToken) {
    log.warn("VIMEO_ACCESS_TOKEN is not set; all Vimeo endpoints will return NOT_CONFIGURED");
  }
});
