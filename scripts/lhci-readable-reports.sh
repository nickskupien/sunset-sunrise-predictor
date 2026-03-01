#!/usr/bin/env bash
set -euo pipefail

REPORT_DIR=".lighthouseci"
COMMIT_HASH="${LHCI_BUILD_CONTEXT__CURRENT_HASH:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}"
COMMIT_BRANCH="${LHCI_BUILD_CONTEXT__CURRENT_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)}"
COMMIT_MESSAGE="${LHCI_BUILD_CONTEXT__COMMIT_MESSAGE:-$(git log -1 --pretty=%s "$COMMIT_HASH" 2>/dev/null || echo "")}"
COMMIT_TIME="${LHCI_BUILD_CONTEXT__COMMIT_TIME:-$(git show -s --format=%cI "$COMMIT_HASH" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")}"
COMMIT_DATE_TAG="$(
  node -e 'const d = new Date(process.argv[1]); if (Number.isNaN(d.getTime())) process.exit(1); const y = d.getUTCFullYear(); const m = String(d.getUTCMonth() + 1).padStart(2, "0"); const day = String(d.getUTCDate()).padStart(2, "0"); process.stdout.write(`${y}${m}${day}`);' "$COMMIT_TIME" 2>/dev/null \
    || date -u +"%Y%m%d"
)"
OUTPUT_DIR="reports/lighthouse/${COMMIT_DATE_TAG}-${COMMIT_HASH}"

mkdir -p "$OUTPUT_DIR"

node - "$REPORT_DIR" "$OUTPUT_DIR" "$COMMIT_HASH" "$COMMIT_BRANCH" "$COMMIT_MESSAGE" "$COMMIT_TIME" <<'NODE'
const fs = require("fs");
const path = require("path");

const reportDir = process.argv[2];
const outputDir = process.argv[3];
const commitHash = process.argv[4];
const commitBranch = process.argv[5];
const commitMessage = process.argv[6];
const commitTime = process.argv[7];

if (!fs.existsSync(reportDir)) {
  console.log(`No ${reportDir} directory found; skipping readable report generation.`);
  process.exit(0);
}

/** @type {Array<{url:string, fetchTime:string, jsonFile:string, htmlFile:string}>} */
const entries = [];

for (const file of fs.readdirSync(reportDir)) {
  if (!file.startsWith("lhr-") || !file.endsWith(".json")) continue;
  const jsonPath = path.join(reportDir, file);
  const htmlFile = file.replace(/\.json$/, ".html");
  const htmlPath = path.join(reportDir, htmlFile);
  if (!fs.existsSync(htmlPath)) continue;

  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const url = data.finalUrl || data.requestedUrl;
    const fetchTime = data.fetchTime;
    if (!url || !fetchTime) continue;
    entries.push({ url, fetchTime, jsonFile: file, htmlFile });
  } catch {
    // Ignore malformed files.
  }
}

if (entries.length === 0) {
  console.log("No LHCI report pairs found to postprocess.");
  process.exit(0);
}

function slugFromUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  const pathname = parsed.pathname === "/" ? "home" : parsed.pathname.replace(/^\/+/, "");
  return pathname.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function timeStampIso(rawTime) {
  const date = new Date(rawTime);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}-${h}${min}${s}`;
}

/** @type {Map<string, {url:string, fetchTime:string, jsonFile:string, htmlFile:string}>} */
const latestByUrl = new Map();
for (const entry of entries) {
  const prev = latestByUrl.get(entry.url);
  if (!prev || Date.parse(entry.fetchTime) > Date.parse(prev.fetchTime)) {
    latestByUrl.set(entry.url, entry);
  }
}

const manifest = [];

for (const entry of [...latestByUrl.values()].sort((a, b) => a.url.localeCompare(b.url))) {
  const slug = slugFromUrl(entry.url);
  const stamp = timeStampIso(entry.fetchTime);
  const jsonOut = `${stamp}_${slug}.json`;
  const htmlOut = `${stamp}_${slug}.html`;

  fs.copyFileSync(path.join(reportDir, entry.jsonFile), path.join(outputDir, jsonOut));
  fs.copyFileSync(path.join(reportDir, entry.htmlFile), path.join(outputDir, htmlOut));

  manifest.push({
    url: entry.url,
    fetchTime: entry.fetchTime,
    html: htmlOut,
    json: jsonOut,
  });
}

fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const listItems = manifest
  .map(
    (entry) => `
      <li>
        <a href="${escapeHtml(entry.html)}">${escapeHtml(entry.html)}</a>
        <small> (${escapeHtml(entry.url)} at ${escapeHtml(entry.fetchTime)})</small>
      </li>`,
  )
  .join("\n");

const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lighthouse Reports - ${escapeHtml(commitHash)}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 2rem; line-height: 1.5; }
      h1, h2 { margin: 0 0 0.75rem; }
      .meta { margin: 0.25rem 0; color: #333; }
      ul { margin-top: 0.75rem; }
      li { margin: 0.35rem 0; }
      small { color: #555; }
      code { background: #f3f4f6; padding: 0.1rem 0.3rem; border-radius: 4px; }
    </style>
  </head>
  <body>
    <h1>Lighthouse Report Index</h1>
    <p class="meta"><strong>Commit:</strong> <code>${escapeHtml(commitHash)}</code></p>
    <p class="meta"><strong>Branch:</strong> <code>${escapeHtml(commitBranch || "unknown")}</code></p>
    <p class="meta"><strong>Committed At:</strong> <code>${escapeHtml(commitTime || "N/A")}</code></p>
    <p class="meta"><strong>Summary:</strong> ${escapeHtml(commitMessage || "N/A")}</p>
    <h2>Reports</h2>
    <ul>
${listItems}
    </ul>
  </body>
</html>
`;

fs.writeFileSync(path.join(outputDir, "index.html"), indexHtml);
console.log(`Generated ${manifest.length} readable Lighthouse report(s) in ${outputDir}`);
NODE
