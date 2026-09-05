import { Router } from "express";
import { vimeo } from "../services/vimeo";

export const healthRouter = Router();

healthRouter.get("/", async (req, res, next) => {
  const base = {
    status: "ok",
    time: new Date().toISOString(),
    vimeoConfigured: vimeo.isConfigured(),
  };
  if (req.query.deep !== "1") {
    res.json(base);
    return;
  }
  try {
    const auth = await vimeo.checkAuth();
    res.json({ ...base, vimeo: auth });
  } catch (err) {
    next(err);
  }
});
