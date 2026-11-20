# Imports keys from a "NAME: value" text file that lives OUTSIDE OneDrive (e.g. C:\Users\avina\secrets\NEW_KEYS.txt)
# into Windows user variables, with the same checks as set-keys.ps1. Values are never printed, only lengths.
# Lines starting with # are ignored; an empty value is skipped.
#   pwsh -File tools\import-keys.ps1 -File C:\Users\avina\secrets\NEW_KEYS.txt
param([Parameter(Mandatory)][string]$File)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $File)) { throw "No file at $File" }
# Judge the real location, so a relative path inside a synced folder is caught too (review fix, round 2).
$full = (Resolve-Path -LiteralPath $File).ProviderPath
$syncRoots = @($env:OneDrive, $env:OneDriveCommercial, $env:OneDriveConsumer) | Where-Object { $_ }
if ($full -match 'OneDrive' -or ($syncRoots | Where-Object { $full.StartsWith($_, [StringComparison]::OrdinalIgnoreCase) })) {
  throw 'Keep key files outside OneDrive.'
}
$File = $full

# Label in the file -> (variable name, the shape the value must have).
$labels = [ordered]@{
  AZURE_KEY2            = @('AZURE_OPENAI_KEY_CI', '^[A-Za-z0-9]{32,100}$')
  ADZUNA_APP_ID         = @('ADZUNA_APP_ID', '^[A-Za-z0-9]{6,16}$')
  ADZUNA_APP_KEY        = @('ADZUNA_APP_KEY', '^[A-Za-z0-9]{20,64}$')
  CLOUDFLARE_TOKEN      = @('CLOUDFLARE_API_TOKEN', '^[A-Za-z0-9_\-]{30,200}$')
  CLOUDFLARE_ACCOUNT_ID = @('CLOUDFLARE_ACCOUNT_ID', '^[0-9a-f]{32}$')
  CONTACT_EMAIL         = @('CONTACT_EMAIL', '^[^@\s]+@[^@\s]+\.[^@\s]+$')
}
$known = 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_KEY_CI', 'AZURE_OPENAI_BASE_URL', 'ADZUNA_APP_ID', 'ADZUNA_APP_KEY',
  'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_DB_PASSWORD', 'CONTACT_EMAIL'

$values = [ordered]@{}
foreach ($line in Get-Content -LiteralPath $File -Encoding utf8) {
  if ($line -match '^\s*#' -or $line -notmatch '^\s*([A-Za-z0-9_]+)\s*[:=]\s*(.*)$') { continue }
  $label = $Matches[1].ToUpperInvariant()
  $value = $Matches[2].Trim().Trim('"', "'").Trim()
  if (-not $labels.Contains($label)) { "${label}: unknown label, ignored"; continue }
  if ($value) { $values[$label] = $value }
}

foreach ($label in $labels.Keys) {
  $name, $shape = $labels[$label]
  if (-not $values.Contains($label)) { '{0,-22} empty, skipped' -f $label; continue }
  $value = $values[$label]
  $twinInFile = $values.Keys | Where-Object { $_ -ne $label -and $values[$_] -ceq $value } | Select-Object -First 1
  $twinSaved = $known | Where-Object { $_ -ne $name -and [Environment]::GetEnvironmentVariable($_, 'User') -ceq $value } | Select-Object -First 1
  if ($twinInFile -or $twinSaved) { '{0,-22} NOT saved: same value as {1} (a mis-paste)' -f $label, $(if ($twinInFile) { $twinInFile } else { $twinSaved }); continue }
  if ($value -cnotmatch $shape) { '{0,-22} NOT saved: does not look like this key ({1} chars)' -f $label, $value.Length; continue }
  [Environment]::SetEnvironmentVariable($name, $value, 'User')
  '{0,-22} saved as {1} ({2} chars)' -f $label, $name, $value.Length
}
