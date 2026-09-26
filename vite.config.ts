/// <reference types="vitest" />
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  // The self-hosted webfonts in src/assets/fonts are ~50KB total. Without a
  // raised limit Vite would emit them as separate files, which would break the
  // single-file dist/index.html produced by viteSingleFile.
  assetsInclude: ['**/*.woff2'],
  build: {
    assetsInlineLimit: 128 * 1024,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: 'node',
    globals: true,
  },
});
