#!/bin/bash
# Idempotent: user-space zsh 5.9 (Debian pool, amd64) + oh-my-zsh for the
# solveit terminal. No root needed; everything lands on the persistent
# volume (~ = /app/data). Re-running writes nothing that already works.
set -e
ZSH_PREFIX="$HOME/opt/zsh"
ZSH_BIN="$ZSH_PREFIX/bin/zsh"
DEB_BASE='http://deb.debian.org/debian/pool/main/z/zsh'
DEB_BIN="$DEB_BASE/zsh_5.9-4+b15_amd64.deb"
DEB_COMMON="$DEB_BASE/zsh-common_5.9-4_all.deb"

if [ "$(uname -m)" != "x86_64" ]; then
  echo "This script installs the amd64 debs; edit the URLs for $(uname -m)." >&2; exit 1
fi

if [ ! -x "$ZSH_BIN" ]; then
  echo "Fetching zsh into $ZSH_PREFIX ..."
  mkdir -p "$ZSH_PREFIX"
  curl -fsSL -o /tmp/zsh.deb "$DEB_BIN"
  curl -fsSL -o /tmp/zsh-common.deb "$DEB_COMMON"
  dpkg-deb -x /tmp/zsh.deb "$ZSH_PREFIX"
  dpkg-deb -x /tmp/zsh-common.deb "$ZSH_PREFIX"
fi
"$ZSH_BIN" --version

[ -d "$HOME/.oh-my-zsh" ] || git clone --depth=1 https://github.com/ohmyzsh/ohmyzsh.git "$HOME/.oh-my-zsh"

# Dotfiles: back up any pre-existing copies once, then (re)write ours.
for f in .bashrc .bash_profile .zshrc; do
  if [ -f "$HOME/$f" ] && [ ! -f "$HOME/$f.solveit-bak" ]; then cp "$HOME/$f" "$HOME/$f.solveit-bak"; fi
done

cat > "$HOME/.bashrc" <<'EOF'
# solveit terminal: interactive shells exec into zsh (system, else user-space)
if [[ $- == *i* && -z $ZSH_VERSION ]]; then
  for z in /usr/bin/zsh "$HOME/opt/zsh/bin/zsh"; do
    [[ -x $z ]] && exec "$z" -l
  done
fi
EOF

printf '[[ -f ~/.bashrc ]] && . ~/.bashrc\n' > "$HOME/.bash_profile"

cat > "$HOME/.zshrc" <<'EOF'
P="$HOME/opt/zsh"   # user-space zsh prefix (harmless if zsh is system-installed)
[[ -d $P/usr/share/zsh/functions ]] && fpath=($P/usr/share/zsh/functions/*(-/) $fpath)
[[ -d $P/usr/lib/x86_64-linux-gnu/zsh/5.9 ]] && module_path=("$P/usr/lib/x86_64-linux-gnu/zsh/5.9" $module_path)
export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME="robbyrussell"
plugins=(git)
[[ -f $ZSH/oh-my-zsh.sh ]] && source $ZSH/oh-my-zsh.sh
EOF

echo "Done — open a NEW terminal for zsh (existing ones stay bash)."
