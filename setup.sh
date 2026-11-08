#!/bin/bash
cd "$(dirname "$(realpath "$0")")" || exit 1
for f in CRAFT.css CRAFT.js; do ln -sfn "$PWD/$f" ~/"$f"; done
echo "Linked. Reload the page to apply."
