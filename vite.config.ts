import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  server: {
    host: "::",
    // PORT erlaubt es, den Dev-Server auf einen freien Port auszuweichen, wenn
    // 8080 schon belegt ist. Ohne PORT bleibt es beim gewohnten 8080.
    port: Number(process.env.PORT) || 8080,
    hmr: { overlay: false },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
          pdf: ['jspdf', 'jspdf-autotable', 'html2canvas'],
        },
      },
    },
  },
});
