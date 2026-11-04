import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src")
    }
  },
  server: {
    host: true,
    port: parseInt(process.env.PORT || "8443"),
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://localhost:5001",
        changeOrigin: false
      }
    }
  },
  preview: {
    host: true,
    port: parseInt(process.env.PORT || "8443")
  }
});
