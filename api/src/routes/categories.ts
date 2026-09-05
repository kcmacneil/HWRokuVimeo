import { Router } from "express";
import { vimeo } from "../services/vimeo";

export const categoriesRouter = Router();

categoriesRouter.get("/", async (_req, res, next) => {
  try {
    const categories = await vimeo.listCategories();
    res.json({ categories });
  } catch (err) {
    next(err);
  }
});
