import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "serve" ? "/" : "/cf_marc/",
}));
