import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:8787", changeOrigin: true } },
  },
  build: { chunkSizeWarningLimit: 1600, rollupOptions: { output: { manualChunks(id) {
    // CommonJS interop is also used by React. Keep the shared helper out of
    // Phaser so the initial homepage does not import the entire game engine.
    if (id.includes("commonjsHelpers")) return "vendor-interop";
    if (id.includes("node_modules/phaser/")) return "phaser";
  } } } },
});
