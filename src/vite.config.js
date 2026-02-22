import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react({
    jsxRuntime: 'automatic',
    include: /\.(js|jsx)$/, // 👈 allow JSX in .js files too
  })],
});
