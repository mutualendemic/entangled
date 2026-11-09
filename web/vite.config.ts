import { execFileSync } from "node:child_process";
import process from "node:process";
import { defineConfig } from "vite";

const commitHash = process.env.VERCEL_GIT_COMMIT_SHA
  ?? process.env.GITHUB_SHA
  ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

export default defineConfig({
  envDir: "..",
  define: {
    __APP_VERSION__: JSON.stringify(commitHash.slice(0, 7)),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:5000",
    },
  },
});