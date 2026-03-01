#!/usr/bin/env bash
set -euo pipefail

pnpm --filter @sunset/web build
pnpm exec lhci collect --config=.lighthouserc.cjs

assert_status=0
if ! pnpm exec lhci assert --config=.lighthouserc.cjs; then
  assert_status=$?
fi

./scripts/lhci-readable-reports.sh
exit "$assert_status"
