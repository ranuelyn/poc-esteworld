import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "web",
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: true,
    proxy: {
      "/api": "http://localhost:3000",
      "/health": "http://localhost:3000"
    }
  },
  build: {
    outDir: "../dist-web",
    emptyOutDir: true
  }
});
