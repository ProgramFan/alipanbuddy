#!/usr/bin/env bash
# Assemble the Linux artifacts (FHS tar.gz, .deb, .rpm) from a finished
# `tauri build` for the given target triple. All three share one staging
# layout: binaries in usr/lib/alipanbuddy with a usr/bin symlink, so the
# bundled aria2c never collides with the system aria2c package.
#
#   scripts/build-linux-packages.sh [target-triple] [--require-all]
#
# --require-all fails when dpkg-deb / rpmbuild are missing (CI); without it
# unavailable package formats are skipped with a warning.
set -euo pipefail

TARGET="x86_64-unknown-linux-gnu"
REQUIRE_ALL=0
for arg in "$@"; do
  case "$arg" in
    --require-all) REQUIRE_ALL=1 ;;
    *) TARGET="$arg" ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"
SUMMARY="AlipanBuddy (神行云盘助手) - Aliyun Drive desktop client"

case "$TARGET" in
  x86_64-*) ARCH=x86_64; DEB_ARCH=amd64 ;;
  aarch64-*) ARCH=aarch64; DEB_ARCH=arm64 ;;
  *) echo "unsupported target: $TARGET" >&2; exit 1 ;;
esac

RELEASE_DIR="$ROOT/src-tauri/target/$TARGET/release"
[ -x "$RELEASE_DIR/alipanbuddy" ] || RELEASE_DIR="$ROOT/src-tauri/target/release"
[ -x "$RELEASE_DIR/alipanbuddy" ] || { echo "alipanbuddy binary not found — run tauri build first" >&2; exit 1; }
[ -x "$RELEASE_DIR/aria2c" ] || { echo "aria2c sidecar not found next to the binary" >&2; exit 1; }

OUT="$ROOT/dist-linux"
rm -rf "$OUT"
mkdir -p "$OUT"

# Writes the shared FHS tree (usr/...) into "$1".
stage_tree() {
  local dest="$1"
  mkdir -p "$dest/usr/bin" "$dest/usr/lib/alipanbuddy" "$dest/usr/share/applications"
  install -m 755 "$RELEASE_DIR/alipanbuddy" "$dest/usr/lib/alipanbuddy/alipanbuddy"
  install -m 755 "$RELEASE_DIR/aria2c" "$dest/usr/lib/alipanbuddy/aria2c"
  ln -s ../lib/alipanbuddy/alipanbuddy "$dest/usr/bin/alipanbuddy"
  local spec size file
  for spec in "32x32:32x32.png" "128x128:128x128.png" "256x256:128x128@2x.png"; do
    size="${spec%%:*}"
    file="${spec#*:}"
    mkdir -p "$dest/usr/share/icons/hicolor/$size/apps"
    install -m 644 "$ROOT/src-tauri/icons/$file" "$dest/usr/share/icons/hicolor/$size/apps/alipanbuddy.png"
  done
  install -m 644 "$ROOT/scripts/linux-tarball/alipanbuddy.desktop" "$dest/usr/share/applications/alipanbuddy.desktop"
}

# --- tar.gz (self-installing: install.sh at the root) ---
NAME="alipanbuddy-$VERSION-linux-$ARCH"
stage_tree "$OUT/$NAME"
install -m 755 "$ROOT/scripts/linux-tarball/install.sh" "$OUT/$NAME/install.sh"
tar -C "$OUT" -czf "$OUT/$NAME.tar.gz" "$NAME"
rm -rf "$OUT/$NAME"
echo "built $OUT/$NAME.tar.gz"

# --- .deb ---
if command -v dpkg-deb >/dev/null 2>&1; then
  DEBROOT="$OUT/debroot"
  stage_tree "$DEBROOT"
  mkdir -p "$DEBROOT/DEBIAN"
  installed_size=$(du -sk "$DEBROOT/usr" | cut -f1)
  cat > "$DEBROOT/DEBIAN/control" << EOF
Package: alipanbuddy
Version: $VERSION
Architecture: $DEB_ARCH
Maintainer: programfan <zyang1984@gmail.com>
Installed-Size: $installed_size
Section: net
Priority: optional
Homepage: https://github.com/programfan/alipanbuddy
Depends: libwebkit2gtk-4.1-0, libgtk-3-0, libayatana-appindicator3-1 | libappindicator3-1
Description: $SUMMARY
 Aliyun Drive desktop client: multi-account login, file and album
 management, sharing, aria2c downloads, encrypted transfers.
 .
 The bundled aria2c lives in /usr/lib/alipanbuddy and never conflicts
 with the system aria2 package.
EOF
  dpkg-deb --build --root-owner-group "$DEBROOT" "$OUT/alipanbuddy_${VERSION}_${DEB_ARCH}.deb" > /dev/null
  rm -rf "$DEBROOT"
  echo "built $OUT/alipanbuddy_${VERSION}_${DEB_ARCH}.deb"
elif [ "$REQUIRE_ALL" = 1 ]; then
  echo "dpkg-deb not found but --require-all was given" >&2
  exit 1
else
  echo "skipped .deb (dpkg-deb not found)" >&2
fi

# --- .rpm ---
if command -v rpmbuild >/dev/null 2>&1; then
  RPMTOP="$OUT/rpmtop"
  RPMSRC="$OUT/rpmsrc"
  mkdir -p "$RPMTOP"/{BUILD,RPMS,SPECS,SOURCES,BUILDROOT}
  stage_tree "$RPMSRC"
  cat > "$RPMTOP/SPECS/alipanbuddy.spec" << EOF
%define debug_package %{nil}
%define _build_id_links none

Name: alipanbuddy
Version: $VERSION
Release: 1
Summary: $SUMMARY
License: GPL-3.0-only
URL: https://github.com/programfan/alipanbuddy

%description
Aliyun Drive desktop client: multi-account login, file and album
management, sharing, aria2c downloads, encrypted transfers.
The bundled aria2c lives in /usr/lib/alipanbuddy and never conflicts
with the system aria2 package.

%install
cp -a $RPMSRC/usr %{buildroot}/

%files
/usr/bin/alipanbuddy
/usr/lib/alipanbuddy
/usr/share/applications/alipanbuddy.desktop
/usr/share/icons/hicolor/*/apps/alipanbuddy.png

%changelog
* $(LC_ALL=C date '+%a %b %d %Y') programfan <zyang1984@gmail.com> - $VERSION-1
- Automated release build
EOF
  rpmbuild -bb --quiet --define "_topdir $RPMTOP" --target "$ARCH" "$RPMTOP/SPECS/alipanbuddy.spec"
  cp "$RPMTOP/RPMS/$ARCH/alipanbuddy-$VERSION-1.$ARCH.rpm" "$OUT/"
  rm -rf "$RPMTOP" "$RPMSRC"
  echo "built $OUT/alipanbuddy-$VERSION-1.$ARCH.rpm"
elif [ "$REQUIRE_ALL" = 1 ]; then
  echo "rpmbuild not found but --require-all was given" >&2
  exit 1
else
  echo "skipped .rpm (rpmbuild not found)" >&2
fi
