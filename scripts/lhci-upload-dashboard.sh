#!/usr/bin/env bash
set -euo pipefail

# Load local env vars for convenience.
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${LHCI_SERVER_BASE_URL:=http://localhost:9001}"
: "${LHCI_TOKEN:?LHCI_TOKEN must be set to your LHCI build token}"

upload_cmd=(
  pnpm
  exec
  lhci
  upload
  --config=.lighthouserc.cjs
  --target=lhci
  --serverBaseUrl="$LHCI_SERVER_BASE_URL"
  --token="$LHCI_TOKEN"
)

if [[ -n "${LHCI_BASIC_AUTH_USERNAME:-}" && -n "${LHCI_BASIC_AUTH_PASSWORD:-}" ]]; then
  upload_cmd+=(--basicAuth.username="$LHCI_BASIC_AUTH_USERNAME")
  upload_cmd+=(--basicAuth.password="$LHCI_BASIC_AUTH_PASSWORD")
fi

if output="$("${upload_cmd[@]}" 2>&1)"; then
  echo "$output"
  exit 0
fi

echo "$output" >&2

if [[ "$output" != *"Build already exists for hash"* ]]; then
  exit 1
fi

: "${LHCI_ADMIN_TOKEN:?Duplicate build found. Set LHCI_ADMIN_TOKEN (project admin token) to replace existing builds for this hash.}"

echo "Duplicate build detected. Replacing existing build for current hash..." >&2

build_hash="${LHCI_BUILD_CONTEXT__CURRENT_HASH:-$(git rev-parse HEAD)}"
server_url="${LHCI_SERVER_BASE_URL%/}"
curl_auth_args=()

if [[ -n "${LHCI_BASIC_AUTH_USERNAME:-}" && -n "${LHCI_BASIC_AUTH_PASSWORD:-}" ]]; then
  curl_auth_args=(-u "${LHCI_BASIC_AUTH_USERNAME}:${LHCI_BASIC_AUTH_PASSWORD}")
fi

project_json="$(
  curl -fsS \
    "${curl_auth_args[@]}" \
    -H "content-type: application/json" \
    -H "x-lhci-build-token: $LHCI_TOKEN" \
    -X POST \
    "$server_url/v1/projects/lookup" \
    --data "{\"token\":\"$LHCI_TOKEN\"}"
)"

project_id="$(
  node -e 'const data = JSON.parse(process.argv[1] || "{}"); if (!data.id) process.exit(1); process.stdout.write(String(data.id));' "$project_json"
)"

builds_json="$(
  curl -fsS \
    "${curl_auth_args[@]}" \
    -H "x-lhci-build-token: $LHCI_TOKEN" \
    "$server_url/v1/projects/$project_id/builds?hash=$build_hash"
)"

build_ids="$(
  node -e 'const builds = JSON.parse(process.argv[1] || "[]"); for (const b of builds) if (b?.id) console.log(String(b.id));' "$builds_json"
)"

if [[ -z "$build_ids" ]]; then
  echo "No existing builds found for hash $build_hash; cannot replace." >&2
  exit 1
fi

while IFS= read -r build_id; do
  [[ -z "$build_id" ]] && continue
  curl -fsS \
    "${curl_auth_args[@]}" \
    -H "x-lhci-admin-token: $LHCI_ADMIN_TOKEN" \
    -X DELETE \
    "$server_url/v1/projects/$project_id/builds/$build_id" >/dev/null
done <<< "$build_ids"

echo "Deleted existing build(s) for hash $build_hash. Uploading replacement..." >&2
"${upload_cmd[@]}"
