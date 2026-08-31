#!/usr/bin/env bash
# Assemble the FHS Linux tarball (usr/ tree + install.sh) from a finished
# `tauri build` for the given target triple. Output: dist-tarball/*.tar.gz
set -euo pipefail

TARGET="${1:-x86_64-unknown-linux-gnu}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"

case "$TARGET" in
  x86_64-*) ARCH=x86_64 ;;
  aarch64-*) ARCH=aarch64 ;;
  *) echo "unsupported target: $TARGET" >&2; exit 1 ;;
esac

RELEASE_DIR="$ROOT/src-tauri/target/$TARGET/release"
[ -x "$RELEASE_DIR/alipanbuddy" ] || RELEASE_DIR="$ROOT/src-tauri/target/release"
[ -x "$RELEASE_DIR/alipanbuddy" ] || { echo "alipanbuddy binary not found — run tauri build first" >&2; exit 1; }
[ -x "$RELEASE_DIR/aria2c" ] || { echo "aria2c sidecar not found next to the binary" >&2; exit 1; }

NAME="alipanbuddy-$VERSION-linux-$ARCH"
OUT="$ROOT/dist-tarball"
STAGE="$OUT/$NAME"
rm -rf "$STAGE"
mkdir -p "$STAGE/usr/bin" "$STAGE/usr/lib/alipanbuddy" "$STAGE/usr/share/applications"

install -m 755 "$RELEASE_DIR/alipanbuddy" "$STAGE/usr/lib/alipanbuddy/alipanbuddy"
install -m 755 "$RELEASE_DIR/aria2c" "$STAGE/usr/lib/alipanbuddy/aria2c"
ln -s ../lib/alipanbuddy/alipanbuddy "$STAGE/usr/bin/alipanbuddy"

for spec in "32x32:32x32.png" "128x128:128x128.png" "256x256:128x128@2x.png"; do
  size="${spec%%:*}"
  file="${spec#*:}"
  mkdir -p "$STAGE/usr/share/icons/hicolor/$size/apps"
  install -m 644 "$ROOT/src-tauri/icons/$file" "$STAGE/usr/share/icons/hicolor/$size/apps/alipanbuddy.png"
done

install -m 644 "$ROOT/scripts/linux-tarball/alipanbuddy.desktop" "$STAGE/usr/share/applications/alipanbuddy.desktop"
install -m 755 "$ROOT/scripts/linux-tarball/install.sh" "$STAGE/install.sh"

tar -C "$OUT" -czf "$OUT/$NAME.tar.gz" "$NAME"
rm -rf "$STAGE"
echo "built $OUT/$NAME.tar.gz"
