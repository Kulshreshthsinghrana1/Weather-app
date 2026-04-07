import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const proxyRoutes = {
  "/api/open-meteo/forecast": {
    target: "https://api.open-meteo.com",
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/open-meteo\/forecast/, "/v1/gfs"),
  },
  "/api/open-meteo/archive": {
    target: "https://archive-api.open-meteo.com",
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/open-meteo\/archive/, "/v1/archive"),
  },
  "/api/open-meteo/air-quality": {
    target: "https://air-quality-api.open-meteo.com",
    changeOrigin: true,
    rewrite: (path) =>
      path.replace(/^\/api\/open-meteo\/air-quality/, "/v1/air-quality"),
  },
  "/api/open-meteo/geocoding": {
    target: "https://geocoding-api.open-meteo.com",
    changeOrigin: true,
    rewrite: (path) =>
      path.replace(/^\/api\/open-meteo\/geocoding/, "/v1/search"),
  },
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: proxyRoutes,
  },
});
