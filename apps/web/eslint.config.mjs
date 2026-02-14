import next from "@sunset/config/eslint/next";
import boundaries from "@sunset/config/eslint/web-boundaries";

const config = [
  {
    ignores: [".next/**"],
  },
  ...next,
  ...boundaries,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
];

export default config;
