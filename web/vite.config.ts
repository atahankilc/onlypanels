import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // MapLibre finds its worker next to its own file, so it must stay unbundled.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  // A Cloudflare quick tunnel shares the running app by link (D134): Vite must accept its address.
  server: { port: 5173, allowedHosts: [".trycloudflare.com"], proxy: { "/api": process.env.API_URL ?? "http://127.0.0.1:8000" } },
});
