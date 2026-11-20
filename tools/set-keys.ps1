# Saves the project's keys as Windows user environment variables, so no key file sits in OneDrive.
# Usage (in a terminal, inside the project folder):
#   powershell -ExecutionPolicy Bypass -File tools\set-keys.ps1          # asks for each missing value
#   powershell -ExecutionPolicy Bypass -File tools\set-keys.ps1 -All     # asks for every value again
#   powershell -ExecutionPolicy Bypass -File tools\set-keys.ps1 -Check   # shows which names are set
# Values are typed without being shown and are never printed (only their length, to catch a bad paste).
param([switch]$Check, [switch]$All)

# Asked from the owner. Each comes from an account only the owner can open.
$asked = [ordered]@{
  AZURE_OPENAI_KEY_CI   = 'Azure KEY 2 (portal > the coding resource > Keys and Endpoint), used only by GitHub Actions'
  ADZUNA_APP_ID         = 'Adzuna Application ID (developer.adzuna.com > Dashboard)'
  ADZUNA_APP_KEY        = 'Adzuna Application Key'
  CLOUDFLARE_API_TOKEN  = 'Cloudflare API token with Account > Cloudflare Pages > Edit'
  CLOUDFLARE_ACCOUNT_ID = 'Cloudflare Account ID (the long id in the dashboard URL)'
  SUPABASE_ACCESS_TOKEN = 'Supabase access token (supabase.com/dashboard/account/tokens)'
  CONTACT_EMAIL         = 'OPTIONAL personal email for removal requests (Enter = use a GitHub issues link)'
}
# Set by the setup scripts, never typed: listed so -Check shows the whole picture.
$derived = 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_BASE_URL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_DB_PASSWORD'

if ($Check) {
  foreach ($name in @($asked.Keys) + $derived) {
    $current = [Environment]::GetEnvironmentVariable($name, 'User')
    '{0,-26} {1}' -f $name, $(if ($current) { "set ($($current.Length) chars)" } else { 'MISSING' })
  }
  return
}

foreach ($name in $asked.Keys) {
  $current = [Environment]::GetEnvironmentVariable($name, 'User')
  if ($current -and -not $All) { "$name already set, skipped"; continue }
  $secure = Read-Host -AsSecureString -Prompt "$($asked[$name]) [$name] (paste, then Enter; Enter alone skips)"
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  if ([string]::IsNullOrWhiteSpace($plain)) { "$name skipped"; continue }
  $plain = $plain.Trim()
  [Environment]::SetEnvironmentVariable($name, $plain, 'User')
  "$name saved ($($plain.Length) chars)"
  $plain = $null
}
'Done. Tell Claude "done".'
