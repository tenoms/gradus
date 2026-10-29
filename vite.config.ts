import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
// Vite evaluates this file in Node; only config/public.json enters browser code.
import { readRuntimeConfig } from "./server/infrastructure/runtime-config.mjs";
import { deploymentConfigPath } from "./server/infrastructure/configuration.mjs";
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const runtime = readRuntimeConfig({ env });
  const deploymentFile = deploymentConfigPath({ env });
  const apiHost = ["0.0.0.0", "::"].includes(runtime.http.host) ? "localhost" : runtime.http.host;
  const apiTarget = `http://${apiHost.includes(":") ? `[${apiHost}]` : apiHost}:${runtime.http.port}`;
  return {
  plugins: [
    react(),
    {
      name: "study-space-entries",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const [pathname, search = ""] = (req.url || "").split("?", 2);
          if (pathname === "/") { res.writeHead(302, { Location: "/learn/" }); res.end(); return; }
          if (/^\/admin(?:\/|$)/.test(pathname)) req.url = `/admin.html${search ? `?${search}` : ""}`;
          else if (/^\/learn(?:\/|$)/.test(pathname)) req.url = `/learn.html${search ? `?${search}` : ""}`;
          next();
        });
      },
    },
  ],
  build: { rollupOptions: { input: { index: "index.html", learning: "learn.html", admin: "admin.html" } } },
  server: {
    host: runtime.development.host,
    port: runtime.development.port,
    fs: { deny: [...runtime.development.fsDeny, ...(deploymentFile ? [deploymentFile] : [])] },
    watch: {
      ignored: ["**/docs/**", "**/artifacts/**"],
    },
    proxy: { "/api": { target: apiTarget, changeOrigin: false } },
  },
  };
});
