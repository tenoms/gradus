import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    watch: {
      ignored: [
        "**/wx*-math/**",
        "**/wx*-computer/**",
        "**/docs/**",
        "**/artifacts/**",
      ],
    },
    proxy: { "/api": { target: "http://127.0.0.1:3001", changeOrigin: false } },
  },
});
