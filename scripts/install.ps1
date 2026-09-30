#Requires -Version 5.1
<#
.SYNOPSIS
  Fully automatic poke-code installer for Windows.
  Installs Bun and git (via winget) when missing, clones/updates the repo,
  installs project dependencies, links the `poke-code` binary onto PATH,
  and starts poke-code (first start asks for the Poke API key via onboarding).

  Run with:
    powershell -c "irm https://raw.githubusercontent.com/Malti2/poke-code/main/scripts/install.ps1 | iex"
#>
$ErrorActionPreference = "Stop"

$RepoUrl = "https://github.com/Malti2/poke-code.git"
$Dest = Join-Path $HOME "poke-code"

function Has-Command($name) {
  return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Refresh-Path {
  $user = [System.Environment]::GetEnvironmentVariable("Path", "User")
  $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
  $env:Path = "$user;$machine"
}

Write-Host "== poke-code installer ==" -ForegroundColor Cyan

# 1. Bun
if (-not (Has-Command "bun")) {
  Write-Host "Installing Bun..."
  irm bun.sh/install.ps1 | iex
  Refresh-Path
}
if (-not (Has-Command "bun")) {
  throw "Bun installation failed. Install it manually from https://bun.sh and re-run this script."
}
Write-Host "Bun: $(bun --version)"

# 2. git
if (-not (Has-Command "git")) {
  Write-Host "Installing git..."
  if (Has-Command "winget") {
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    Refresh-Path
  } else {
    throw "winget not found. Install git from https://git-scm.com/download/win and re-run this script."
  }
}
if (-not (Has-Command "git")) {
  throw "git is still not on PATH. Open a NEW terminal window and re-run this script."
}
Write-Host "git: $(git --version)"

# 3. Clone or update
if (Test-Path (Join-Path $Dest ".git")) {
  Write-Host "Updating existing checkout in $Dest ..."
  git -C $Dest pull --ff-only
} elseif (-not (Test-Path $Dest)) {
  Write-Host "Cloning poke-code to $Dest ..."
  git clone $RepoUrl $Dest
} else {
  throw "$Dest exists but is not a git checkout. Move it aside and re-run this script."
}

# 4. Project dependencies + 5. link binary onto PATH
Write-Host "Installing project dependencies..."
Push-Location $Dest
try {
  bun install
  Write-Host "Linking the poke-code binary..."
  bun link
} finally {
  Pop-Location
}
Refresh-Path

# 6. Start (first start runs the API-key onboarding)
Write-Host "" 
Write-Host "Done!" -ForegroundColor Green
$pokeCodeWorks = $false
if (Has-Command "poke-code") {
  try { & poke-code --version | Out-Null; $pokeCodeWorks = ($LASTEXITCODE -eq 0) } catch { $pokeCodeWorks = $false }
}
if ($pokeCodeWorks) {
  Write-Host "Starting poke-code..."
  & poke-code
} else {
  Write-Host "'poke-code' binary did not start cleanly - launching via bun directly instead."
  Write-Host "(If this keeps happening, re-run this installer after 'git pull'.)"
  & bun (Join-Path $Dest "src/main.tsx")
}
