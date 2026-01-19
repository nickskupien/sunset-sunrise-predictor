module.exports = {
  root: true,
  extends: [
    require.resolve("@sunset/config/eslint/next"),
    require.resolve("@sunset/config/eslint/web-boundaries")
  ]
};

