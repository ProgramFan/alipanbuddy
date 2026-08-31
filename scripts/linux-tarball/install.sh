#!/usr/bin/env bash
# Install / uninstall AlipanBuddy from the extracted tarball.
#   ./install.sh                 system install into /usr/local (needs sudo)
#   ./install.sh --user          per-user install into ~/.local
#   ./install.sh --prefix DIR    install into a custom prefix
#   ./install.sh --uninstall     remove a previous install (combine with --user/--prefix)
set -euo pipefail

PREFIX=/usr/local
MODE=install
while [ $# -gt 0 ]; do
  case "$1" in
    --user) PREFIX="$HOME/.local" ;;
    --prefix) PREFIX="$2"; shift ;;
    --prefix=*) PREFIX="${1#--prefix=}" ;;
    --uninstall) MODE=uninstall ;;
    -h|--help) sed -n '3,7p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1 (see --help)" >&2; exit 1 ;;
  esac
  shift
done

SRC="$(cd "$(dirname "$0")" && pwd)"
BINDIR="$PREFIX/bin"
LIBDIR="$PREFIX/lib/alipanbuddy"
APPDIR="$PREFIX/share/applications"
ICONROOT="$PREFIX/share/icons/hicolor"

writable_root="$PREFIX"
while [ ! -e "$writable_root" ]; do writable_root="$(dirname "$writable_root")"; done
if [ ! -w "$writable_root" ]; then
  echo "No write access to $PREFIX — rerun with sudo, or use --user for a per-user install." >&2
  exit 1
fi

refresh_caches() {
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPDIR" 2>/dev/null || true
  command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q "$ICONROOT" 2>/dev/null || true
}

if [ "$MODE" = uninstall ]; then
  rm -rf "$LIBDIR"
  rm -f "$BINDIR/alipanbuddy" "$APPDIR/alipanbuddy.desktop"
  for size in 32x32 128x128 256x256; do
    rm -f "$ICONROOT/$size/apps/alipanbuddy.png"
  done
  refresh_caches
  echo "AlipanBuddy removed from $PREFIX"
  exit 0
fi

mkdir -p "$BINDIR" "$LIBDIR" "$APPDIR"
# aria2c must stay next to the alipanbuddy executable (the app looks it up there),
# so both live in lib/alipanbuddy with a bin/ symlink for PATH.
install -m 755 "$SRC/usr/lib/alipanbuddy/alipanbuddy" "$LIBDIR/alipanbuddy"
install -m 755 "$SRC/usr/lib/alipanbuddy/aria2c" "$LIBDIR/aria2c"
ln -sf ../lib/alipanbuddy/alipanbuddy "$BINDIR/alipanbuddy"

for size in 32x32 128x128 256x256; do
  mkdir -p "$ICONROOT/$size/apps"
  install -m 644 "$SRC/usr/share/icons/hicolor/$size/apps/alipanbuddy.png" "$ICONROOT/$size/apps/alipanbuddy.png"
done

# Absolute Exec so the launcher works even when $PREFIX/bin is not on the
# desktop session's PATH (typical for --user installs).
sed "s|^Exec=.*|Exec=$BINDIR/alipanbuddy|" "$SRC/usr/share/applications/alipanbuddy.desktop" > "$APPDIR/alipanbuddy.desktop"
chmod 644 "$APPDIR/alipanbuddy.desktop"

refresh_caches
echo "AlipanBuddy installed to $PREFIX"
echo "  run it:      $BINDIR/alipanbuddy (or from your application menu)"
echo "  uninstall:   $SRC/install.sh --uninstall --prefix $PREFIX"
