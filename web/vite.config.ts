import { defineConfig } from "vite";

export default defineConfig({
  envDir: "..",
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:5000",
    },
  },
});