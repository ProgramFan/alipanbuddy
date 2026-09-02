#!/usr/bin/env bash
# Assemble the Linux artifacts (FHS tar.gz, .deb, .rpm) from a finished
# `tauri build` for the given target triple. All three share one staging
# layout: binaries in lib/alipanbuddy with a bin/ symlink, so the bundled
# aria2c never collides with the system aria2c package. The packages put
# that tree under usr/; the tarball is prefix-relative, so it unpacks as
# bin/ lib/ share/ next to install.sh.
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

# Writes the shared FHS tree into "$1". "$2" is the prefix directory inside it:
# "usr" for the packages, "" for the tarball, which extracts straight to
# bin/ lib/ share/. The bin/ symlink is relative, so it survives either way.
stage_tree() {
  local dest="$1" prefix="${2-usr}"
  local root="$dest"
  if [ -n "$prefix" ]; then root="$dest/$prefix"; fi
  mkdir -p "$root/bin" "$root/lib/alipanbuddy" "$root/share/applications"
  install -m 755 "$RELEASE_DIR/alipanbuddy" "$root/lib/alipanbuddy/alipanbuddy"
  install -m 755 "$RELEASE_DIR/aria2c" "$root/lib/alipanbuddy/aria2c"
  ln -s ../lib/alipanbuddy/alipanbuddy "$root/bin/alipanbuddy"
  local spec size file
  for spec in "32x32:32x32.png" "128x128:128x128.png" "256x256:128x128@2x.png"; do
    size="${spec%%:*}"
    file="${spec#*:}"
    mkdir -p "$root/share/icons/hicolor/$size/apps"
    install -m 644 "$ROOT/src-tauri/icons/$file" "$root/share/icons/hicolor/$size/apps/alipanbuddy.png"
  done
  install -m 644 "$ROOT/scripts/linux/alipanbuddy.desktop" "$root/share/applications/alipanbuddy.desktop"
}

BINARY="$RELEASE_DIR/alipanbuddy"

# --- tar.gz (self-installing: install.sh at the root) ---
NAME="alipanbuddy-$VERSION-linux-$ARCH"
stage_tree "$OUT/$NAME" ""
install -m 755 "$ROOT/scripts/linux/install.sh" "$OUT/$NAME/install.sh"
tar -C "$OUT" -czf "$OUT/$NAME.tar.gz" "$NAME"
rm -rf "$OUT/$NAME"
echo "built $OUT/$NAME.tar.gz"

# Shared libraries the built binary links against. aria2c is statically linked,
# so the main binary is the only thing that pulls runtime dependencies in.
needed_sonames() {
  if command -v objdump >/dev/null 2>&1; then
    objdump -p "$BINARY" | awk '/NEEDED/ { print $2 }'
  elif command -v readelf >/dev/null 2>&1; then
    readelf -d "$BINARY" | sed -n 's/.*(NEEDED).*\[\(.*\)\]/\1/p'
  else
    echo "neither objdump nor readelf found — cannot derive package dependencies" >&2
    if [ "$REQUIRE_ALL" = 1 ]; then exit 1; fi
  fi
}

SONAMES="$(needed_sonames)"
[ -n "$SONAMES" ] || echo "warning: no NEEDED entries read from $BINARY" >&2

# libayatana-appindicator is opened with dlopen() for the tray icon, so it never
# shows up in NEEDED — both packages have to name it by hand.
DEB_EXTRA_DEPENDS="libayatana-appindicator3-1 | libappindicator3-1, hicolor-icon-theme"
# Used when dpkg-shlibdeps is unavailable; keep in sync with the Ubuntu build image.
DEB_FALLBACK_DEPENDS="libwebkit2gtk-4.1-0, libjavascriptcoregtk-4.1-0, libgtk-3-0, libglib2.0-0, libsoup-3.0-0, libssl3"

# Maps the binary's sonames onto Debian packages (versioned, from the build image).
deb_depends() {
  local resolved=""
  if command -v dpkg-shlibdeps >/dev/null 2>&1; then
    local work="$OUT/shlibdeps"
    rm -rf "$work"
    mkdir -p "$work/debian"
    printf 'Source: alipanbuddy\n\nPackage: alipanbuddy\nArchitecture: any\n' > "$work/debian/control"
    resolved="$(cd "$work" && dpkg-shlibdeps -O --ignore-missing-info "$BINARY" 2>/dev/null | sed -n 's/^shlibs:Depends=//p' || true)"
    rm -rf "$work"
  fi
  if [ -z "$resolved" ]; then
    echo "warning: dpkg-shlibdeps produced nothing — falling back to the curated Depends list" >&2
    resolved="$DEB_FALLBACK_DEPENDS"
  fi
  echo "$resolved, $DEB_EXTRA_DEPENDS"
}

# rpm generates its own soname requires, but only when its ELF helpers are installed
# (they are not, on the Ubuntu build image). Listing them keeps the .rpm honest either way.
rpm_requires() {
  local soname
  for soname in $SONAMES; do
    echo "Requires: ${soname}()(64bit)"
  done
  echo "Requires: (libayatana-appindicator3.so.1()(64bit) or libappindicator3.so.1()(64bit))"
  echo "Requires: hicolor-icon-theme"
}

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
Depends: $(deb_depends)
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
$(rpm_requires)

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
