/** @type {import('@lhci/cli/src/types/lighthouserc').LighthouseRc} */
module.exports = {
  ci: {
    collect: {
      numberOfRuns: 3,
      startServerCommand: "pnpm --filter @sunset/web start",
      startServerReadyPattern: "Ready",
      startServerReadyTimeout: 120000,
      url: [
        "http://127.0.0.1:3000/",
        "http://127.0.0.1:3000/dashboard",
        "http://127.0.0.1:3000/settings",
        "http://127.0.0.1:3000/locations",
        "http://127.0.0.1:3000/forecasts",
      ],
      settings: {
        preset: "desktop",
        chromeFlags: "--no-sandbox --disable-dev-shm-usage",
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["warn", { minScore: 0.85 }],
        "categories:accessibility": ["warn", { minScore: 0.9 }],
        "categories:best-practices": ["warn", { minScore: 0.9 }],
        "categories:seo": ["warn", { minScore: 0.9 }],
      },
    },
  },
};
