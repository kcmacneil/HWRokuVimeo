/**
 * Integration tests: run the Express app against a fake Vimeo API (fetch is
 * stubbed), exercising routing, validation, error mapping and caching.
 */
import { AddressInfo } from "node:net";
import { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Env (VIMEO_ACCESS_TOKEN etc.) is provided by vitest.config.ts.
import { createApp } from "../app";
import { vimeo } from "../services/vimeo";
import { page, rawAlbum, rawFolder, rawTracks, rawVideo } from "./fixtures";

type Route = (url: URL) => { status: number; body: unknown };
let routes: Record<string, Route> = {};
const calls: string[] = [];

function fakeFetch(input: string | URL | Request): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  calls.push(url.pathname);
  const handler = routes[url.pathname];
  if (!handler) return Promise.resolve(new Response(JSON.stringify({ error: "nope" }), { status: 404 }));
  const { status, body } = handler(url);
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

let server: Server;
let base: string;

async function get(path: string, headers: Record<string, string> = {}) {
  const res = await fetch(base + path, { headers });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

beforeAll(async () => {
  vi.stubGlobal("fetch", ((input: string | URL | Request, init?: RequestInit) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return href.startsWith("https://api.vimeo.com") ? fakeFetch(input) : realFetch(input, init);
  }) as typeof fetch);
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
const realFetch = fetch;

afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vimeo.clearCache();
  calls.length = 0;
  routes = {
    "/me": () => ({ status: 200, body: { uri: "/users/42", name: "Tester", account: "pro" } }),
    "/users/42/videos": (u) => {
      const p = Number(u.searchParams.get("page") ?? "1");
      return { status: 200, body: page([rawVideo], p, 120, p < 3 ? `/users/42/videos?page=${p + 1}` : null) };
    },
    "/users/42/projects": () => ({ status: 200, body: page([rawFolder]) }),
    "/users/42/albums": () => ({ status: 200, body: page([rawAlbum]) }),
    "/users/42/projects/77/videos": () => ({ status: 200, body: page([rawVideo]) }),
    "/videos/123456789": () => ({ status: 200, body: rawVideo }),
    "/videos/123456789/texttracks": () => ({ status: 200, body: page(rawTracks) }),
    "/videos/404404": () => ({ status: 404, body: { error: "not found" } }),
    "/videos/403403": () => ({ status: 403, body: { error: "forbidden" } }),
    "/videos/500500": () => ({ status: 500, body: { error: "boom" } }),
    "/videos/777": () => ({ status: 200, body: { ...rawVideo, uri: "/videos/777", play: undefined, files: [] } }),
  };
});

describe("health", () => {
  it("returns ok without hitting Vimeo", async () => {
    const r = await get("/api/health");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "ok", vimeoConfigured: true });
    expect(calls).toEqual([]);
  });
  it("deep check verifies Vimeo auth", async () => {
    const r = await get("/api/health?deep=1");
    expect(r.body.vimeo).toEqual({ ok: true, account: "pro", user: "Tester" });
  });
  it("maps Vimeo 401 to VIMEO_AUTH_FAILED without leaking the token", async () => {
    routes["/me"] = () => ({ status: 401, body: { error: "bad token test-token-secret" } });
    const r = await get("/api/health?deep=1");
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe("VIMEO_AUTH_FAILED");
    expect(JSON.stringify(r.body)).not.toContain("test-token-secret");
  });
});

describe("videos", () => {
  it("lists videos with pagination info", async () => {
    const r = await get("/api/videos?page=2&perPage=10");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ page: 2, total: 120, hasMore: true, nextPage: 3 });
    expect(r.body.videos[0]).toMatchObject({ id: "123456789", title: "Example Lecture", category: "Lectures" });
  });

  it("caches list responses", async () => {
    await get("/api/videos");
    await get("/api/videos");
    expect(calls.filter((c) => c === "/users/42/videos")).toHaveLength(1);
  });

  it("filters by folder category and labels videos with the folder name", async () => {
    const r = await get("/api/videos?category=folder:77");
    expect(r.status).toBe(200);
    expect(r.body.videos[0].category).toBe("Lectures");
    expect(calls).toContain("/users/42/projects/77/videos");
  });

  it("rejects malformed category ids", async () => {
    const r = await get("/api/videos?category=bogus");
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("BAD_REQUEST");
  });

  it("returns details for a video", async () => {
    const r = await get("/api/videos/123456789");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: "123456789", privacy: "unlisted", playable: true, duration: 1800 });
  });

  it("validates video ids", async () => {
    const r = await get("/api/videos/abc");
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("BAD_REQUEST");
  });

  it("maps Vimeo 404/403/500 to friendly codes", async () => {
    expect((await get("/api/videos/404404")).body.error.code).toBe("VIDEO_UNAVAILABLE");
    expect((await get("/api/videos/403403")).body.error.code).toBe("VIDEO_RESTRICTED");
    const r = await get("/api/videos/500500");
    expect(r.status).toBe(502);
    expect(r.body.error).toMatchObject({ code: "VIMEO_UNAVAILABLE", retryable: true });
  });
});

describe("playback", () => {
  it("returns a fresh HLS url, captions and no-store header", async () => {
    const r = await get("/api/videos/123456789/play");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: "123456789", streamUrl: "https://player.vimeo.com/hls.m3u8", streamFormat: "hls" });
    expect(r.body.captions).toHaveLength(1);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("never caches playback lookups", async () => {
    await get("/api/videos/123456789/play");
    await get("/api/videos/123456789/play");
    expect(calls.filter((c) => c === "/videos/123456789")).toHaveLength(2);
  });

  it("returns NO_STREAM when Vimeo exposes no links", async () => {
    const r = await get("/api/videos/777/play");
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("NO_STREAM");
  });
});

describe("categories", () => {
  it("merges folders and showcases and drops empty ones", async () => {
    const r = await get("/api/categories");
    expect(r.status).toBe(200);
    expect(r.body.categories.map((c: { id: string }) => c.id)).toEqual(["folder:77"]);
  });
});

describe("misc", () => {
  it("404s unknown routes with JSON", async () => {
    const r = await get("/api/nope");
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("NOT_FOUND");
  });
});
