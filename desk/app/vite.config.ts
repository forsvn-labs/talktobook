import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const API = process.env.EREADER_API ?? "http://127.0.0.1:8650"

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    allowedHosts: [".getbb.app"],
    proxy: {
      "/api": { target: API, changeOrigin: true },
      "/vendor": { target: API, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
})
