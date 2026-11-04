import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// The site is served from /<repo-name>/ on GitHub Pages: the deploy sets VITE_BASE.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [vue()],
  resolve: { alias: { "@content": new URL("../../content", import.meta.url).pathname } },
  server: { fs: { allow: ["../.."] } },
  build: { target: "es2022" },
});
