import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) {
            return "three-core";
          }

          if (id.includes("@react-three")) {
            return "react-three";
          }

          if (id.includes("@react-three/drei")) {
            return "drei";
          }
        },
      },
    },
  },
});
