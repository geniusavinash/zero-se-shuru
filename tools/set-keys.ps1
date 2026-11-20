# Saves the project's keys as Windows user environment variables, so no key file sits in OneDrive.
# Usage (in a terminal, inside the project folder):
#   powershell -ExecutionPolicy Bypass -File tools\set-keys.ps1          # asks for each missing value
#   powershell -ExecutionPolicy Bypass -File tools\set-keys.ps1 -All     # asks for every value again
#   powershell -ExecutionPolicy Bypass -File tools\set-keys.ps1 -Check   # shows which names are set
# Values are typed without being shown and are never printed (only their length).
# Each value is checked against the shape of that key, and a value already saved under another name is
# refused: on 2026-11-20 one clipboard paste landed in three prompts and reached GitHub secrets.
param([switch]$Check, [switch]$All)

# Asked from the owner: name = (prompt, the shape the value must have).
$asked = [ordered]@{
  AZURE_OPENAI_KEY_CI   = @('Azure KEY 2 (portal > the coding resource > Keys and Endpoint > KEY 2)', '^[A-Za-z0-9]{32,100}$')
  ADZUNA_APP_ID         = @('Adzuna Application ID (developer.adzuna.com > Dashboard, about 8 characters)', '^[A-Za-z0-9]{6,16}$')
  ADZUNA_APP_KEY        = @('Adzuna Application Key (about 32 characters)', '^[A-Za-z0-9]{20,64}$')
  CLOUDFLARE_API_TOKEN  = @('Cloudflare API token with Account > Cloudflare Pages > Edit', '^[A-Za-z0-9_\-]{30,200}$')
  CLOUDFLARE_ACCOUNT_ID = @('Cloudflare Account ID (32 characters, in the dashboard URL)', '^[0-9a-f]{32}$')
  SUPABASE_ACCESS_TOKEN = @('Supabase access token (supabase.com/dashboard/account/tokens)', '^sbp_[A-Za-z0-9_]{20,}$')
  CONTACT_EMAIL         = @('OPTIONAL personal email for removal requests (Enter = use a GitHub issues link)', '^[^@\s]+@[^@\s]+\.[^@\s]+$')
}
# Set by the setup scripts, never typed: listed so -Check shows the whole picture.
$derived = 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_BASE_URL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_DB_PASSWORD'
$everyName = @($asked.Keys) + $derived

if ($Check) {
  foreach ($name in $everyName) {
    $current = [Environment]::GetEnvironmentVariable($name, 'User')
    '{0,-26} {1}' -f $name, $(if ($current) { "set ($($current.Length) chars)" } else { 'MISSING' })
  }
  return
}

foreach ($name in $asked.Keys) {
  $current = [Environment]::GetEnvironmentVariable($name, 'User')
  if ($current -and -not $All) { "$name already set, skipped"; continue }
  $prompt, $shape = $asked[$name]
  for ($try = 1; $try -le 3; $try++) {
    $secure = Read-Host -AsSecureString -Prompt "$prompt [$name] (paste, then Enter; Enter alone skips)"
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
    if ([string]::IsNullOrWhiteSpace($plain)) { "$name skipped"; break }
    $plain = $plain.Trim()
    $twin = $everyName | Where-Object { $_ -ne $name -and [Environment]::GetEnvironmentVariable($_, 'User') -ceq $plain } | Select-Object -First 1
    if ($twin) { "  Not saved: this is the value already saved as $twin. Copy the right one and paste again."; $plain = $null; continue }
    if ($plain -cnotmatch $shape) { "  Not saved: this does not look like the $name ($($plain.Length) chars). Paste again."; $plain = $null; continue }
    [Environment]::SetEnvironmentVariable($name, $plain, 'User')
    "$name saved ($($plain.Length) chars)"
    $plain = $null
    break
  }
}
'Done. Tell Claude "done".'
