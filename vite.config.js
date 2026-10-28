import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Every file sits in the main folder of the repo, so no subfolders are needed.
export default defineConfig({
  plugins: [react()],
});
