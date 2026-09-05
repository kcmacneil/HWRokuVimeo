import express, { ErrorRequestHandler, RequestHandler } from "express";
import { config } from "./config";
import { log } from "./logger";
import { categoriesRouter } from "./routes/categories";
import { healthRouter } from "./routes/health";
import { videosRouter } from "./routes/videos";
import { ApiError } from "./utils/errors";

/** Optional shared-secret check. Roku sends "X-Api-Key: <API_KEY>". */
const apiKeyGuard: RequestHandler = (req, res, next) => {
  if (!config.apiKey) return next();
  if (req.path === "/api/health" && req.query.deep !== "1") return next();
  const supplied = req.header("x-api-key");
  if (supplied && supplied === config.apiKey) return next();
  res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Unauthorized.", retryable: false } });
};

const requestLog: RequestHandler = (req, res, next) => {
  const started = Date.now();
  res.on("finish", () => {
    log.info("request", { method: req.method, path: req.originalUrl, status: res.statusCode, ms: Date.now() - started });
  });
  next();
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    if (err.status >= 500) log.error("api error", { code: err.code, message: err.message });
    res.status(err.status).json(err.toJSON());
    return;
  }
  log.error("unhandled error", { err: err instanceof Error ? err.stack ?? err.message : String(err) });
  res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong.", retryable: true } });
};

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);
  app.use(requestLog);
  app.use(apiKeyGuard);

  app.use("/api/health", healthRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/videos", videosRouter);

  app.get("/", (_req, res) => res.json({ name: "hw-roku-vimeo-api", docs: "/api/health" }));
  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found.", retryable: false } });
  });
  app.use(errorHandler);
  return app;
}
