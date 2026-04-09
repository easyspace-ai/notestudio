#!/usr/bin/env bash
# Unified test entry: use from repo root, e.g. ./scripts/test.sh
# Env:
#   PKG   - package pattern (default ./...)
#   RACE  - set to 1 to enable -race (slower)
#   SHORT - set to 1 to pass -short to tests
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PKG="${1:-./...}"
ARGS=(-count=1 -timeout=15m)

if [[ "${SHORT:-}" == "1" ]]; then
  ARGS+=(-short)
fi
if [[ "${RACE:-}" == "1" ]]; then
  ARGS+=(-race)
fi

echo "[test] go test ${ARGS[*]} $PKG"
exec go test "${ARGS[@]}" "$PKG"
