# Pin gh to this repo's GitHub account for the current PowerShell session.
#
#   . .\scripts\gh-env.ps1
#
# See scripts/gh-env.sh for why this exists. The token is read from gh's
# keyring each time and never written to disk. Shell-scoped, not repo-scoped.
$GhEnvAccount = "tkhandelwal"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Error "gh-env: gh is not on PATH"
} else {
  $t = gh auth token --user $GhEnvAccount 2>$null
  if ($t) {
    $env:GH_TOKEN = $t
    Write-Output "gh-env: GH_TOKEN set for $GhEnvAccount (token not printed)"
  } else {
    Write-Error "gh-env: no token for $GhEnvAccount. Run: gh auth login --hostname github.com"
  }
  Remove-Variable t -ErrorAction SilentlyContinue
}
