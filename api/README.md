# api/ – Vimeo middleware

See the [root README](../README.md) for the full picture. Quick reference:

```bash
cp .env.example .env   # add VIMEO_ACCESS_TOKEN
npm install
npm run dev            # http://localhost:3000/api/health
npm test               # vitest
npm run lint && npm run typecheck
npm run build && npm start
```

Deploy: `npx vercel --prod` from this directory (or set Vercel *Root Directory* = `api`).
`vercel.json` routes all paths to `api/index.ts`, which exports the Express app from
`src/app.ts`.
