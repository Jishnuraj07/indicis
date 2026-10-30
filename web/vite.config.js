import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `npm run dev` serves the UI on :5173 and forwards /api to the Python server on :8000.
// `npm run build` writes the finished app into ../static, which the Python server serves.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/static/" : "/",
  build: { outDir: "../static", emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:8000" } },
}));
