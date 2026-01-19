/** Node.js/server-side ESLint config. */
module.exports = {
  extends: [require.resolve("./base.cjs")],
  env: {
    node: true
  }
};

