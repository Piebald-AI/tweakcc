#!/usr/bin/env bash
# Recomputes the pnpmDeps hash in nix/package.nix after pnpm-lock.yaml changes.
# Run this after updating dependencies.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_NIX="$SCRIPT_DIR/package.nix"

# Set a fake hash to force a mismatch
sed -i 's|hash = "sha256-.*";|hash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";|' "$PACKAGE_NIX"

echo "Computing pnpm deps hash..."
OUTPUT=$(nix build "$(dirname "$SCRIPT_DIR")#tweakcc" 2>&1 || true)

HASH=$(echo "$OUTPUT" | grep "got:" | awk '{print $2}')
if [ -z "$HASH" ]; then
  echo "Error: could not extract hash from nix output:"
  echo "$OUTPUT"
  exit 1
fi

sed -i "s|hash = \"sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\";|hash = \"$HASH\";|" "$PACKAGE_NIX"
echo "Updated nix/package.nix hash to: $HASH"
