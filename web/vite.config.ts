import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { fs: { allow: [".."] } },
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, "index.html"), pitch: resolve(__dirname, "pitch/index.html") },
    },
  },
});
