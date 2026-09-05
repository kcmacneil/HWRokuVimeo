// Vercel serverless entry point. All routes are rewritten here (see vercel.json)
// and handled by the shared Express app.
import { createApp } from "../src/app";

export default createApp();
