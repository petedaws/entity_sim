import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/entity_sim/" : "/",
  server: {
    open: true,
    https: true
  }
});
