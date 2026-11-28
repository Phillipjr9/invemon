import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Vercel owns the production listener; local/container Vite servers honor PORT.
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}
const listener = {
  host: '0.0.0.0',
  port,
  strictPort: true,
  // Keep host validation enabled; allow only the supported preview providers.
  allowedHosts: ['.e2b.app', 'ov7279w32e.preview.c24.airoapp.ai'],
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  server: listener,
  preview: listener,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
