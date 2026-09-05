import { Router } from "express";
import { config } from "../config";
import { isValidVideoId } from "../services/normalize";
import { vimeo } from "../services/vimeo";
import { ApiError } from "../utils/errors";

export const videosRouter = Router();

function intParam(raw: unknown, fallback: number): number {
  if (typeof raw !== "string") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
}

function strParam(raw: unknown, maxLen = 200): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > maxLen) return null;
  return s;
}

// GET /api/videos?category=&page=&perPage=&sort=&q=
videosRouter.get("/", async (req, res, next) => {
  try {
    const sortRaw = strParam(req.query.sort);
    const sort = sortRaw === "alphabetical" || sortRaw === "duration" ? sortRaw : "date";
    const result = await vimeo.listVideos({
      page: intParam(req.query.page, 1),
      perPage: intParam(req.query.perPage, config.pageSize),
      category: strParam(req.query.category),
      sort,
      query: strParam(req.query.q, 100),
    });
    res.set("Cache-Control", `public, max-age=${Math.min(config.cacheTtlSeconds, 60)}`);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

videosRouter.param("videoId", (_req, _res, next, id: string) => {
  if (!isValidVideoId(id)) {
    next(new ApiError(400, "BAD_REQUEST", "Invalid video id."));
    return;
  }
  next();
});

videosRouter.get("/:videoId", async (req, res, next) => {
  try {
    const video = await vimeo.getVideo(req.params.videoId);
    res.json(video);
  } catch (err) {
    next(err);
  }
});

// Never cached: returns a fresh, short-lived Vimeo playback URL.
videosRouter.get("/:videoId/play", async (req, res, next) => {
  try {
    const playback = await vimeo.getPlayback(req.params.videoId);
    res.set("Cache-Control", "no-store");
    res.json(playback);
  } catch (err) {
    next(err);
  }
});
