#!/bin/bash
set -euo pipefail
repo_dir=$(dirname "$(realpath "$0")")
replace=false
target=$HOME
while (($#)); do
  case "$1" in
    --replace) replace=true; shift ;;
    --dest)
      if (($# < 2)) || [[ -z "$2" ]]; then echo "--dest requires a directory" >&2; exit 2; fi
      target=$2; shift 2 ;;
    --help|-h)
      echo "Usage: bash setup.sh [--replace] [--dest DIR]"
      echo "Default: preserve local files; save different repo versions under numbered names."
      echo "--replace: back up different installed files, then activate the repo versions."
      echo "--dest DIR: install into DIR instead of HOME (normally /app/data)."
      exit 0 ;;
    *) echo "Unknown option: $1 (use --help)" >&2; exit 2 ;;
  esac
done
target=$(realpath -m "$target")
cd "$repo_dir"
if [[ "$target" == "$PWD" ]]; then echo "Destination must not be the source checkout." >&2; exit 2; fi
files=(CRAFT.css CRAFT.js quercus-treeview.css quercus-treeview.js hotkey_manager.js hotkey_builtins.js craft_md.js vscode-icons/*)
for f in "${files[@]}"; do
  if [[ -L "$f" || ! -f "$f" ]]; then echo "$PWD/$f is not a regular file. Stopping." >&2; exit 1; fi
done
mkdir -p "$target/.craft-assets/vscode-icons"
backup_dir=
for f in "${files[@]}"; do
  case "$f" in
    CRAFT.css|CRAFT.js) rel=$f ;;
    *) rel=.craft-assets/$f ;;
  esac
  dest=$target/$rel
  if [[ -d "$dest" ]]; then echo "$dest is a directory. Stopping." >&2; exit 1; fi
  if [[ -e "$dest" ]] && cmp -s "$f" "$dest"; then echo "$dest already matches the repo version"; continue; fi
  if [[ ! -e "$dest" && ! -L "$dest" ]]; then cp "$f" "$dest"; echo "Copied $f to $dest"; continue; fi
  if $replace; then
    if [[ -z "$backup_dir" ]]; then
      mkdir -p "$target/.craft-backups"
      backup_dir=$(mktemp -d "$target/.craft-backups/install-XXXXXXXX")
    fi
    mkdir -p "$(dirname "$backup_dir/$rel")"
    cp -Pp "$dest" "$backup_dir/$rel"
    cp --remove-destination "$f" "$dest"
    echo "Updated $dest (previous copy: $backup_dir/$rel)"
    continue
  fi
  name=${rel##*/}
  if [[ "$name" == *.* ]]; then base=${rel%.*}; ext=.${rel##*.}; else base=$rel; ext=; fi
  n=0; out=$dest
  while [[ -e "$out" || -L "$out" ]]; do
    if [[ -f "$out" ]] && cmp -s "$f" "$out"; then break; fi
    n=$((n+1)); out=$target/$base-$n$ext
  done
  if [[ -e "$out" ]]; then echo "$out already matches the repo version"; continue; fi
  cp "$f" "$out"
  echo "Preserved $dest; copied the repo version to $out. Merge manually or use --replace."
done
if [[ -n "$backup_dir" ]]; then echo "Backups kept in $backup_dir"; fi
legacy=()
for old in quercus-treeview.css quercus-treeview.js hotkey_manager.js hotkey_builtins.js vscode-icons; do
  if [[ -e "$target/$old" || -L "$target/$old" ]]; then legacy+=("$old"); fi
done
if ((${#legacy[@]})); then
  echo "Note: old root-level copies remain in $target (now served from $target/.craft-assets/): ${legacy[*]}"
fi
echo "Reload the page to apply CSS/JS. Existing pages keep their currently loaded code."
