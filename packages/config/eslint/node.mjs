import base from "./base.mjs";
import globals from "globals";

/** Node.js/server-side ESLint config. */
export default [
  ...base,
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
