/** Next.js + React ESLint config. */
module.exports = {
  extends: ["next/core-web-vitals", require.resolve("./base.cjs")],
  env: {
    browser: true,
    node: false
  }
};

