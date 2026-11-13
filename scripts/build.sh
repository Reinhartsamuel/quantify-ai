#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

bun run typecheck
bun run --cwd apps/web build

echo "Build complete. API and worker run TypeScript directly under Bun; see infra/docker for images."
