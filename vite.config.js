// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({

  plugins: [
    react(),
    tailwindcss(),
  ],
 
  server: {
    proxy: {
      "/api": {
        target: "https://fitness-1-od9s.onrender.com",
        changeOrigin: true,
      },
    },
  },

});