import { FlatCompat } from "@eslint/eslintrc";
import { fixupConfigRules } from "@eslint/compat";
import globals from "globals";

import base from "./base.mjs";

const flatCompat = new FlatCompat();

/** Next.js + React ESLint config. */
const config = [
  ...base,
  ...fixupConfigRules(flatCompat.extends("eslint-config-next/core-web-vitals")),
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
];

export default config;
