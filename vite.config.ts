import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tanstackStart({
      server: {
        entry: "server",
      },
    }),
    nitro({ preset: "node-server" }),
    viteReact(),
    tailwindcss(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "firebase-firestore",
              test: /node_modules[\\/]@firebase[\\/]firestore/,
              priority: 4,
            },
            {
              name: "firebase-auth",
              test: /node_modules[\\/]@firebase[\\/]auth/,
              priority: 4,
            },
            {
              name: "firebase-storage",
              test: /node_modules[\\/]@firebase[\\/]storage/,
              priority: 4,
            },
            {
              name: "firebase-core",
              test: /node_modules[\\/](?:@firebase|firebase)[\\/]/,
              priority: 3,
            },
            {
              name: "tanstack",
              test: /node_modules[\\/]@tanstack[\\/]/,
              priority: 2,
            },
            {
              name: "radix-ui",
              test: /node_modules[\\/]@radix-ui[\\/]/,
              priority: 2,
            },
          ],
        },
      },
    },
  },
});
