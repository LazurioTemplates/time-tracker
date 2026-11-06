import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Vite builds the client of the built version (`bun run build` → dist/). A
// development run does not use Vite: the Bun server bundles the client itself
// (src/server/serve.ts), so the App stays one process (Module Standard).
export default defineConfig({
  root: "src/ui",
  // One TypeScript configuration for every file of the client, also the design
  // system's tokens in design-system/: its own tsconfig belongs to its Astro
  // viewer, which the App does not install.
  tsconfig: resolve(import.meta.dirname, "tsconfig.json"),
  plugins: [react()],
  // No .env* files anywhere (Module Standard, MS-07).
  envDir: false,
  build: { outDir: "../../dist", emptyOutDir: true },
});
