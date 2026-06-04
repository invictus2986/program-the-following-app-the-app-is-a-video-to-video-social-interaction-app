// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PluginOption } from "vite";

// Post-build: rename the ASSETS binding (reserved by Cloudflare Pages) to
// STATIC_ASSETS in the Nitro-generated .output/server/wrangler.json.
const renameAssetsBinding = (): PluginOption => ({
  name: "lovable:rename-assets-binding",
  apply: "build",
  enforce: "post",
  closeBundle: {
    order: "post",
    sequential: true,
    async handler() {
      const candidates = [
        resolve(process.cwd(), "dist/server/wrangler.json"),
        resolve(process.cwd(), ".output/server/wrangler.json"),
      ];
      for (const path of candidates) {
        try {
          const raw = await readFile(path, "utf8");
          const cfg = JSON.parse(raw);
          let changed = false;
          if (cfg?.assets?.binding === "ASSETS") {
            cfg.assets.binding = "STATIC_ASSETS";
            changed = true;
          }
          if (Array.isArray(cfg?.bindings)) {
            for (const b of cfg.bindings) {
              if (b?.type === "assets" && b?.name === "ASSETS") {
                b.name = "STATIC_ASSETS";
                changed = true;
              }
            }
          }
          if (changed) {
            await writeFile(path, JSON.stringify(cfg, null, 2));
            console.log("[lovable] Renamed ASSETS binding -> STATIC_ASSETS in", path);
          }
        } catch (err: unknown) {
          if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
        }
      }
    },
  },
});

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: true,
  plugins: [renameAssetsBinding()],
});
