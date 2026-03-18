import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  root: "client",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Each entry point will be built separately
        espera: resolve(__dirname, "client/src/pages/proxy/espera.html"),
      },
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss, autoprefixer],
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
