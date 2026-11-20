# Copies the keys from Windows user variables into this repository's GitHub Actions secrets.
# Actions gets Azure KEY 2 (AZURE_OPENAI_KEY_CI) under the name AZURE_OPENAI_API_KEY, never the laptop's
# Key 1, so Key 1 can be changed without breaking the daily refresh. Values go through stdin and are
# never printed. Run inside the project folder: pwsh -File tools\push-secrets.ps1
$ErrorActionPreference = 'Stop'
$gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
if (-not $gh) { $gh = 'C:\Program Files\GitHub CLI\gh.exe' }

# GitHub secret name = local user variable name.
$map = [ordered]@{
  AZURE_OPENAI_API_KEY     = 'AZURE_OPENAI_KEY_CI'
  AZURE_OPENAI_BASE_URL    = 'AZURE_OPENAI_BASE_URL'
  ADZUNA_APP_ID            = 'ADZUNA_APP_ID'
  ADZUNA_APP_KEY           = 'ADZUNA_APP_KEY'
  CLOUDFLARE_API_TOKEN     = 'CLOUDFLARE_API_TOKEN'
  CLOUDFLARE_ACCOUNT_ID    = 'CLOUDFLARE_ACCOUNT_ID'
  SUPABASE_URL             = 'SUPABASE_URL'
  SUPABASE_PUBLISHABLE_KEY = 'SUPABASE_PUBLISHABLE_KEY'
  CONTACT_EMAIL            = 'CONTACT_EMAIL'
}

foreach ($secret in $map.Keys) {
  $value = [Environment]::GetEnvironmentVariable($map[$secret], 'User')
  if (-not $value) { '{0,-26} skipped ({1} is not set on this laptop)' -f $secret, $map[$secret]; continue }
  $value | & $gh secret set $secret 2>&1 | Out-Null
  $ok = $LASTEXITCODE -eq 0
  $value = $null
  '{0,-26} {1}' -f $secret, $(if ($ok) { 'saved' } else { 'FAILED' })
}
& $gh secret list 2>&1 | ForEach-Object { ($_ -split "`t")[0] } | Sort-Object | Join-String -Separator ', ' -OutputPrefix 'Secrets in the repo: '
