#!/bin/sh
# Fully automatic poke-code installer for macOS and Linux.
# Installs Bun and git when missing, clones/updates the repo, installs
# project dependencies, links the `poke-code` binary onto PATH, and starts
# poke-code (first start asks for the Poke API key via onboarding).
#
# Quick start: download this file from the repo's scripts/ folder and run:
#   sh install.sh
set -eu

REPO_URL="https://github.com/Malti2/poke-code.git"
DEST="$HOME/poke-code"

have() { command -v "$1" >/dev/null 2>&1; }

echo "== poke-code installer =="

# 1. Bun (download the installer to a temp file first so it can be inspected,
#    then run it - no piped shell)
if ! have bun; then
  echo "Installing Bun..."
  BUN_DL_HOST="bun.sh"
  TMP_INSTALL="$(mktemp /tmp/bun-install.XXXXXX.sh)"
  curl -fsSL "https://$BUN_DL_HOST/install" -o "$TMP_INSTALL"
  sh "$TMP_INSTALL"
  rm -f "$TMP_INSTALL"
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi
if ! have bun; then
  echo "Bun installation failed. See https://bun.sh" >&2
  exit 1
fi
echo "Bun: $(bun --version)"

# 2. git
if ! have git; then
  echo "Installing git..."
  OS="$(uname -s)"
  if [ "$OS" = "Darwin" ]; then
    if have brew; then
      brew install git
    else
      echo "Opening Apple's command line tools installer (a dialog will appear)..."
      xcode-select --install || true
      echo "Waiting for git to appear - finish the installer dialog..."
      tries=0
      while ! have git && [ "$tries" -lt 60 ]; do
        sleep 10
        tries=$((tries + 1))
      done
    fi
  else
    if have apt-get; then
      sudo apt-get update && sudo apt-get install -y git
    elif have dnf; then
      sudo dnf install -y git
    elif have pacman; then
      sudo pacman -S --noconfirm git
    elif have zypper; then
      sudo zypper install -y git
    elif have apk; then
      sudo apk add git
    else
      echo "No supported package manager found. Install git manually and re-run this script." >&2
      exit 1
    fi
  fi
fi
if ! have git; then
  echo "git is still not available. Install it manually and re-run this script." >&2
  exit 1
fi
echo "git: $(git --version)"

# 3. Clone or update
if [ -d "$DEST/.git" ]; then
  echo "Updating existing checkout in $DEST ..."
  git -C "$DEST" pull --ff-only || true
elif [ ! -e "$DEST" ]; then
  echo "Cloning poke-code to $DEST ..."
  git clone "$REPO_URL" "$DEST"
else
  echo "$DEST exists but is not a git checkout. Move it aside and re-run this script." >&2
  exit 1
fi

# 4. Project dependencies + 5. link binary onto PATH
echo "Installing project dependencies..."
(cd "$DEST" && bun install)
# The linked binary is executed directly via its shebang, so it needs the
# exec bit (git does not always preserve it, e.g. after API pushes).
chmod +x "$DEST/src/main.tsx"
echo "Linking the poke-code binary..."
(cd "$DEST" && bun link)

export PATH="$HOME/.bun/bin:$PATH"

# 6. Start (first start runs the API-key onboarding)
echo ""
echo "Done!"
if have poke-code && poke-code --version >/dev/null 2>&1; then
  echo "Starting poke-code..."
  poke-code
else
  echo "'poke-code' binary did not start cleanly - launching via bun directly instead."
  echo "(If this keeps happening, re-run this installer after 'git pull'.)"
  bun "$DEST/src/main.tsx"
fi
