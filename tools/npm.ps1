# Runs npm against the packages folder outside OneDrive (C:\dev\zero-se-shuru-deps), so the
# node_modules junction in this repo is never replaced by a real folder.
# Usage: powershell -ExecutionPolicy Bypass -File tools\npm.ps1 install <package> [-D]
#        powershell -ExecutionPolicy Bypass -File tools\npm.ps1 uninstall <package>
# Never run `npm install` or `npm ci` directly in this folder on the laptop. (CI runs npm ci normally.)
$proj = Split-Path -Parent $PSScriptRoot
$deps = 'C:\dev\zero-se-shuru-deps'
New-Item -ItemType Directory -Force $deps | Out-Null
Copy-Item -LiteralPath (Join-Path $proj 'package.json'), (Join-Path $proj 'package-lock.json') -Destination $deps -Force
Push-Location $deps
try { npm @args; $code = $LASTEXITCODE } finally { Pop-Location }
Copy-Item -LiteralPath (Join-Path $deps 'package.json'), (Join-Path $deps 'package-lock.json') -Destination $proj -Force
$link = Join-Path $proj 'node_modules'
$item = Get-Item -LiteralPath $link -Force -ErrorAction SilentlyContinue
if (-not $item -or $item.LinkType -ne 'Junction') {
  if ($item) { Remove-Item -LiteralPath $link -Recurse -Force }
  New-Item -ItemType Junction -Path $link -Target (Join-Path $deps 'node_modules') | Out-Null
  'node_modules junction restored'
}
exit $code
