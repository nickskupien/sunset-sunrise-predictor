import node from "@sunset/config/eslint/node";

export default [
  ...node,
  {
    ignores: ["drizzle/**"]
  }
];
