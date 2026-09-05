import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      VIMEO_ACCESS_TOKEN: "test-token-secret",
      VIMEO_USER_ID: "42",
      LOG_LEVEL: "error",
      API_KEY: "",
    },
  },
});
