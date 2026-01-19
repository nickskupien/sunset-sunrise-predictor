/**
 * Web app import boundaries: prevent importing server-only layers.
 *
 * Allowed (web-safe): @sunset/contracts, @sunset/domain, @sunset/scoring
 * Disallowed (server-only): @sunset/db, @sunset/repositories, @sunset/integrations, @sunset/api, @sunset/worker
 */
module.exports = {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@sunset/db",
            message: "web cannot import server-only @sunset/db"
          },
          {
            name: "@sunset/repositories",
            message: "web cannot import server-only @sunset/repositories"
          },
          {
            name: "@sunset/integrations",
            message: "web cannot import server-only @sunset/integrations"
          },
          {
            name: "@sunset/api",
            message: "apps should not import other deployable apps"
          },
          {
            name: "@sunset/worker",
            message: "apps should not import other deployable apps"
          }
        ]
      }
    ]
  }
};

