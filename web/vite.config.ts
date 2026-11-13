import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(process.cwd(), ".."), "");
  const commitHash = process.env.VERCEL_GIT_COMMIT_SHA
    ?? process.env.GITHUB_SHA
    ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const supabaseUrl = env.SUPABASE_URL ?? "";
  const supabasePublicKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  return {
    envDir: "..",
    define: {
      __APP_VERSION__: JSON.stringify(commitHash.slice(0, 7)),
      "import.meta.env.SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": JSON.stringify(supabasePublicKey),
    },
    server: {
      port: 5173,
      proxy: {
        "/api": "http://localhost:5000",
      },
    },
  };
});
