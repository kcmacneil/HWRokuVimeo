import { describe, expect, it } from "vitest";
import {
  isValidVideoId,
  normalizeAlbum,
  normalizeFolder,
  normalizeVideoDetails,
  normalizeVideoPage,
  normalizeVideoSummary,
  parseCategoryId,
  selectStream,
} from "../services/normalize";
import { page, rawAlbum, rawFolder, rawTracks, rawVideo } from "./fixtures";

describe("normalizeVideoSummary", () => {
  it("maps Vimeo fields to the Roku shape", () => {
    const v = normalizeVideoSummary(rawVideo);
    expect(v).toEqual({
      id: "123456789",
      title: "Example Lecture",
      description: "A talk about things.",
      duration: 1800,
      thumbnail: "https://i.vimeocdn.com/640.jpg",
      thumbnailLarge: "https://i.vimeocdn.com/1280.jpg",
      createdAt: "2024-01-02T03:04:05+00:00",
      releaseDate: "2024-01-03T00:00:00+00:00",
      category: "Lectures",
      tags: ["physics", "lecture"],
    });
  });

  it("tolerates missing optional fields", () => {
    const v = normalizeVideoSummary({ uri: "/videos/1", name: "x", description: null, duration: NaN, created_time: "t" });
    expect(v.thumbnail).toBeNull();
    expect(v.duration).toBe(0);
    expect(v.category).toBeNull();
    expect(v.tags).toEqual([]);
  });

  it("prefers an explicit category name over parent_folder", () => {
    expect(normalizeVideoSummary(rawVideo, "Showcase A").category).toBe("Showcase A");
  });
});

describe("normalizeVideoDetails", () => {
  it("exposes privacy/status and playable flag", () => {
    const d = normalizeVideoDetails(rawVideo);
    expect(d.privacy).toBe("unlisted");
    expect(d.playable).toBe(true);
    expect(normalizeVideoDetails({ ...rawVideo, status: "transcoding" }).playable).toBe(false);
    expect(normalizeVideoDetails({ ...rawVideo, privacy: { view: "nobody" } }).playable).toBe(false);
  });
});

describe("normalizeVideoPage", () => {
  it("reports pagination from Vimeo paging.next", () => {
    const withMore = normalizeVideoPage(page([rawVideo], 2, 120, "/me/videos?page=3"));
    expect(withMore).toMatchObject({ page: 2, total: 120, hasMore: true, nextPage: 3 });
    const last = normalizeVideoPage(page([rawVideo], 3, 120, null));
    expect(last).toMatchObject({ hasMore: false, nextPage: null });
    expect(last.videos).toHaveLength(1);
  });

  it("drops videos that are still uploading or set to Private (view=nobody)", () => {
    const p = normalizeVideoPage(
      page(
        [
          rawVideo,
          { ...rawVideo, uri: "/videos/2", status: "uploading_error" },
          { ...rawVideo, uri: "/videos/3", privacy: { view: "nobody" } },
        ],
        1,
        3,
        null,
      ),
    );
    expect(p.videos.map((v) => v.id)).toEqual(["123456789"]);
  });
});

describe("categories", () => {
  it("normalizes folders and showcases with prefixed ids", () => {
    expect(normalizeFolder(rawFolder)).toEqual({
      id: "folder:77",
      kind: "folder",
      name: "Lectures",
      videoCount: 12,
      thumbnail: null,
    });
    expect(normalizeAlbum(rawAlbum)).toMatchObject({ id: "showcase:900", kind: "showcase", videoCount: 0 });
    expect(normalizeAlbum(rawAlbum).thumbnail).toBe("https://i.vimeocdn.com/album.jpg");
  });

  it("parses and rejects category ids", () => {
    expect(parseCategoryId("folder:12")).toEqual({ kind: "folder", id: "12" });
    expect(parseCategoryId("showcase:9")).toEqual({ kind: "showcase", id: "9" });
    expect(parseCategoryId("album:9")).toBeNull();
    expect(parseCategoryId("folder:../x")).toBeNull();
  });
});

describe("isValidVideoId", () => {
  it("accepts only numeric ids", () => {
    expect(isValidVideoId("123")).toBe(true);
    expect(isValidVideoId("12a")).toBe(false);
    expect(isValidVideoId("")).toBe(false);
    expect(isValidVideoId("1".repeat(21))).toBe(false);
  });
});

describe("selectStream", () => {
  it("prefers play.hls and lists alternates", () => {
    const s = selectStream(rawVideo, rawTracks);
    expect(s).not.toBeNull();
    expect(s!.streamUrl).toBe("https://player.vimeo.com/hls.m3u8");
    expect(s!.streamFormat).toBe("hls");
    expect(s!.expiresAt).toBe("2024-01-02T09:00:00+00:00");
    expect(s!.alternates.map((a) => a.quality)).toEqual(["1080p", "540p", "adaptive"]);
    expect(s!.captions).toEqual([{ language: "en", name: "English", type: "captions", url: "https://captions/en.vtt" }]);
  });

  it("falls back to files[] hls, then progressive mp4", () => {
    const filesOnly = {
      ...rawVideo,
      play: undefined,
      files: [
        { quality: "hd", type: "video/mp4", link: "https://f/hd.mp4", height: 720 },
        { quality: "hls", link: "https://f/hls.m3u8" },
      ],
    };
    expect(selectStream(filesOnly)).toMatchObject({ streamUrl: "https://f/hls.m3u8", streamFormat: "hls" });

    const mp4Only = { ...filesOnly, files: filesOnly.files.filter((f) => f.quality !== "hls") };
    expect(selectStream(mp4Only)).toMatchObject({ streamUrl: "https://f/hd.mp4", streamFormat: "mp4" });
  });

  it("returns null when no https stream exists", () => {
    expect(selectStream({ ...rawVideo, play: undefined, files: [] })).toBeNull();
    expect(selectStream({ ...rawVideo, play: { hls: { link: "http://insecure/x.m3u8" } }, files: [] })).toBeNull();
  });
});
