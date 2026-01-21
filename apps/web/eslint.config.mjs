import next from "@sunset/config/eslint/next";
import boundaries from "@sunset/config/eslint/web-boundaries";

const config = [
  {
    ignores: [".next/**"],
  },
  ...next,
  ...boundaries,
];

export default config;
