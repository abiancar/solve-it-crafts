#!/bin/bash
# Copy the CRAFT files, the Quercus tree assets and vscode-icons/ into ~ (= /app/data), mirroring the repo layout. When ~ already holds a different file of that name, copy the repo version to the first free numbered name instead (CRAFT-1.css, vscode-icons/LICENSE-1, ...) for the user to merge by hand.
cd "$(dirname "$(realpath "$0")")" || exit 1
mkdir -p ~/vscode-icons
for f in CRAFT.css CRAFT.js quercus-treeview.css quercus-treeview.js vscode-icons/*; do
  if [ -L "$f" ] || [ ! -f "$f" ]; then
    echo "$PWD/$f is not a regular file. Stopping." >&2; exit 1
  fi
  dest=~/"$f"
  # Replace a broken or looping link. It holds no content to keep.
  if [ -L "$dest" ] && [ ! -e "$dest" ]; then rm "$dest"; fi
  if [ ! -e "$dest" ]; then cp "$f" "$dest"; echo "Copied $f to $dest"; continue; fi
  name=${f##*/}; if [[ $name == *.* ]]; then base=${f%.*} ext=.${f##*.}; else base=$f ext=; fi
  n=0 out=$dest
  while [ -e "$out" ] && ! cmp -s "$f" "$out"; do n=$((n+1)); out=~/"$base-$n$ext"; done
  if [ -e "$out" ]; then echo "$out already matches the repo version"; continue; fi
  cp "$f" "$out"; echo "$dest already exists. Copied the repo version to $out. Merge them by hand."
done
echo "Reload the page to apply."
