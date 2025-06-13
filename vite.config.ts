import { defineConfig } from "vite";

import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteCommonjs } from "@originjs/vite-plugin-commonjs";
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteCommonjs()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ["@cornerstonejs/dicom-image-loader"],
    include: ["dicom-parser"],
  },
  worker: {
    format: "es",
  },
});
