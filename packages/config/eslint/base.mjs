import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** Base TypeScript ESLint config (no environment-specific rules). */
export default [
  {
    ignores: ["dist", "build", "node_modules"]
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended[1].rules
    }
  }
];
