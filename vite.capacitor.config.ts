import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT:
// This is a CAPACITOR-ONLY build (no SSR, no Nitro, no server)
export default defineConfig({
  plugins: [react()],

  build: {
    outDir: "dist",
    emptyOutDir: true,
  },

  // Force SPA behavior (this is what Capacitor needs)
  base: "./",
});
