# Copies the keys from Windows user variables into this repository's GitHub Actions secrets.
# Actions gets Azure KEY 2 (AZURE_OPENAI_KEY_CI) under the name AZURE_OPENAI_API_KEY, never the laptop's
# Key 1, so Key 1 can be changed without breaking the daily refresh. Values go through stdin and are
# never printed. Run inside the project folder: pwsh -File tools\push-secrets.ps1
$ErrorActionPreference = 'Stop'
$gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
if (-not $gh) { $gh = 'C:\Program Files\GitHub CLI\gh.exe' }
# Secrets go to this one repository, never to whatever repo the current folder happens to be (review fix, round 2).
$repo = 'geniusavinash/zero-se-shuru'
$origin = git -C (Join-Path $PSScriptRoot '..') remote get-url origin 2>$null
if ($origin -notmatch 'github\.com[/:]geniusavinash/zero-se-shuru(\.git)?$') { throw "This checkout's origin is not $repo; nothing sent." }

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

# The shape each value must have (the same checks as set-keys.ps1). A value that fails, or that equals
# another variable's value (a mis-paste), is never sent.
$shape = @{
  AZURE_OPENAI_KEY_CI      = '^[A-Za-z0-9]{32,100}$'
  AZURE_OPENAI_BASE_URL    = '^https://[a-z0-9-]+\.openai\.azure\.com/openai/v1/?$'
  ADZUNA_APP_ID            = '^[A-Za-z0-9]{6,16}$'
  ADZUNA_APP_KEY           = '^[A-Za-z0-9]{20,64}$'
  CLOUDFLARE_API_TOKEN     = '^[A-Za-z0-9_\-]{30,200}$'
  CLOUDFLARE_ACCOUNT_ID    = '^[0-9a-f]{32}$'
  SUPABASE_URL             = '^https://[a-z]{20}\.supabase\.co$'
  # Only the new publishable format: a legacy JWT could be a service_role key (review fix, round 2).
  SUPABASE_PUBLISHABLE_KEY = '^sb_publishable_[A-Za-z0-9_\-]+$'
  CONTACT_EMAIL            = '^[^@\s]+@[^@\s]+\.[^@\s]+$'
}
$others = @($map.Values) + 'AZURE_OPENAI_API_KEY', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD'

foreach ($secret in $map.Keys) {
  $value = [Environment]::GetEnvironmentVariable($map[$secret], 'User')
  if (-not $value) { '{0,-26} skipped ({1} is not set on this laptop)' -f $secret, $map[$secret]; continue }
  $twin = $others | Where-Object { $_ -ne $map[$secret] -and [Environment]::GetEnvironmentVariable($_, 'User') -ceq $value } | Select-Object -First 1
  if ($twin) { '{0,-26} NOT SENT: same value as {1} (a mis-paste); run tools\set-keys.ps1 -All' -f $secret, $twin; continue }
  if ($value -cnotmatch $shape[$map[$secret]]) { '{0,-26} NOT SENT: {1} does not look right ({2} chars)' -f $secret, $map[$secret], $value.Length; continue }
  $value | & $gh secret set $secret --repo $repo 2>&1 | Out-Null
  $ok = $LASTEXITCODE -eq 0
  $value = $null
  '{0,-26} {1}' -f $secret, $(if ($ok) { 'saved' } else { 'FAILED' })
}
& $gh secret list --repo $repo 2>&1 | ForEach-Object { ($_ -split "`t")[0] } | Sort-Object | Join-String -Separator ', ' -OutputPrefix 'Secrets in the repo: '
