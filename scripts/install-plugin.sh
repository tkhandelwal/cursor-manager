#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
plugin_src="$root/plugin"
dest_dir="${HOME}/.cursor/plugins/local"
dest="$dest_dir/cursor-manager"

mkdir -p "$dest_dir"
rm -rf "$dest"
ln -s "$plugin_src" "$dest"

echo "Linked Cursor Manager into $dest"
echo "Reload Cursor: Command Palette → Developer: Reload Window"
echo "Then open Customize → Plugins and enable cursor-manager (user scope)."
