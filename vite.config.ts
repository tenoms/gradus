import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
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
    port: 5173,
    watch: {
      ignored: ["**/wx*-math/**", "**/wx*-computer/**", "**/docs/**", "**/artifacts/**"],
    },
    proxy: { "/api": { target: "http://127.0.0.1:3001", changeOrigin: false } },
  },
});
