import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    files: ["app/opengraph-image.tsx"],
    // ImageResponse renders its own image tree and cannot use next/image.
    rules: { "@next/next/no-img-element": "off" }
  },
  globalIgnores([".next/**", "next-env.d.ts"])
]);
