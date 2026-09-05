import { VimeoAlbum, VimeoFolder, VimeoPage, VimeoTextTrack, VimeoVideo } from "../services/normalize";

export const rawVideo: VimeoVideo = {
  uri: "/videos/123456789",
  name: "Example Lecture",
  description: "  A talk about things.  ",
  duration: 1799.6,
  created_time: "2024-01-02T03:04:05+00:00",
  release_time: "2024-01-03T00:00:00+00:00",
  pictures: {
    sizes: [
      { width: 100, height: 75, link: "https://i.vimeocdn.com/100.jpg" },
      { width: 640, height: 360, link: "https://i.vimeocdn.com/640.jpg" },
      { width: 1280, height: 720, link: "https://i.vimeocdn.com/1280.jpg" },
    ],
  },
  privacy: { view: "unlisted" },
  status: "available",
  tags: [{ name: "physics" }, { name: "lecture" }],
  parent_folder: { uri: "/users/1/projects/77", name: "Lectures" },
  play: {
    status: "playable",
    hls: { link: "https://player.vimeo.com/hls.m3u8", link_expiration_time: "2024-01-02T09:00:00+00:00" },
    dash: { link: "https://player.vimeo.com/dash.mpd" },
    progressive: [
      { link: "https://player.vimeo.com/540.mp4", height: 540 },
      { link: "https://player.vimeo.com/1080.mp4", height: 1080 },
    ],
  },
};

export function page<T>(data: T[], pageNo = 1, total = data.length, next: string | null = null): VimeoPage<T> {
  return {
    total,
    page: pageNo,
    per_page: data.length,
    paging: { next, previous: null, first: "/x?page=1", last: "/x?page=9" },
    data,
  };
}

export const rawFolder: VimeoFolder = {
  uri: "/users/1/projects/77",
  name: "Lectures",
  metadata: { connections: { videos: { total: 12 } } },
};

export const rawAlbum: VimeoAlbum = {
  uri: "/users/1/albums/900",
  name: "Best Of",
  pictures: { sizes: [{ width: 640, height: 360, link: "https://i.vimeocdn.com/album.jpg" }] },
  metadata: { connections: { videos: { total: 0 } } },
};

export const rawTracks: VimeoTextTrack[] = [
  { uri: "/videos/1/texttracks/1", active: true, type: "captions", language: "en", link: "https://captions/en.vtt", name: "English" },
  { uri: "/videos/1/texttracks/2", active: false, type: "subtitles", language: "fr", link: "https://captions/fr.vtt" },
];
