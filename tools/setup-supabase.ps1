# Sets up the Supabase project through the Management API, so nobody has to click through the dashboard:
# creates the project in Mumbai (ap-south-1), applies db/schema.sql, turns email confirmation off, and saves
# SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_DB_PASSWORD as Windows user variables.
# Needs SUPABASE_ACCESS_TOKEN (tools\set-keys.ps1). Safe to run again: it reuses the project, and the
# schema only creates what is missing. No token, key or password is ever printed. Run with pwsh 7.
#   pwsh -File tools\setup-supabase.ps1                                   # create or reuse, schema, settings
#   pwsh -File tools\setup-supabase.ps1 -MakeAdmin                        # after the owner signs up on the site
#   pwsh -File tools\setup-supabase.ps1 -MakeAdmin -Email you@example.com # when more than one account exists
param([switch]$MakeAdmin, [string]$Email)
$ErrorActionPreference = 'Stop'

$api = 'https://api.supabase.com/v1'
$projectName = 'zero-se-shuru'
# The page's address comes from config/site.yaml, so sign-in redirects follow it if it changes.
$siteUrl = (Select-String -Path (Join-Path $PSScriptRoot '..\config\site.yaml') -Pattern '^public_url:\s*(\S+)').Matches[0].Groups[1].Value.TrimEnd('/')
$token = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'User')
if (-not $token) { throw 'SUPABASE_ACCESS_TOKEN is not set. Run tools\set-keys.ps1 first.' }
$headers = @{ Authorization = "Bearer $token" }

function Invoke-Supa([string]$Method, [string]$Path, $Body) {
  $req = @{ Method = $Method; Uri = "$api$Path"; Headers = $headers; ContentType = 'application/json' }
  if ($null -ne $Body) { $req.Body = ($Body | ConvertTo-Json -Depth 10 -Compress) }
  try { $res = Invoke-RestMethod @req }
  catch {
    $status = $_.Exception.Response.StatusCode.value__
    throw "Supabase $Method $Path failed (HTTP $status): $($_.ErrorDetails.Message)"
  }
  # Invoke-RestMethod writes a JSON array as ONE object; returning the variable unrolls it into items, so
  # callers filter rows, not the whole array (bug found 2026-11-20: all four keys matched as one "key").
  return $res
}

function Invoke-Sql([string]$Ref, [string]$Sql) {
  return Invoke-Supa POST "/projects/$Ref/database/query" @{ query = $Sql }
}

# The project this laptop already uses (from SUPABASE_URL) wins; otherwise exactly one project with the
# name, never the first of several (review fix, round 2).
function Get-Project {
  $all = @(Invoke-Supa GET '/projects')
  $saved = [Environment]::GetEnvironmentVariable('SUPABASE_URL', 'User')
  if ($saved -match '^https://([a-z0-9]{20})\.supabase\.co') {
    $byRef = @($all | Where-Object { $_.ref -eq $Matches[1] })
    if ($byRef.Count -eq 1) { return $byRef[0] }
    throw "SUPABASE_URL names project $($Matches[1]), which this token cannot see."
  }
  $named = @($all | Where-Object { $_.name -eq $projectName })
  if ($named.Count -gt 1) { throw "$($named.Count) projects are named $projectName; set SUPABASE_URL to the one to use." }
  return $named | Select-Object -First 1
}

function Hide-Email([string]$Address) {
  $at = $Address.IndexOf('@')
  if ($at -lt 1) { return '***' }
  return "$($Address.Substring(0, 1))***$($Address.Substring($at))"
}

# ---- After the owner signs up: make that account the admin (by user id, never by email alone) ----
if ($MakeAdmin) {
  $project = Get-Project
  if (-not $project) { throw "No project named $projectName. Run this script without -MakeAdmin first." }
  # Always by the owner's email, never "the only account": sign-up does not prove email ownership, so the
  # owner must also confirm the sign-up time shown below was theirs and that they can sign in with their
  # own password (review fix, round 2).
  if (-not $Email) { throw 'Run with -Email <the email you signed up with>.' }
  $users = @(Invoke-Sql $project.ref 'select id::text as id, email, created_at, last_sign_in_at from auth.users order by created_at')
  $user = $users | Where-Object { $_.email -and $_.email.ToLowerInvariant() -eq $Email.Trim().ToLowerInvariant() } | Select-Object -First 1
  if (-not $user) { throw "No account with that email ($($users.Count) accounts exist). Sign up on the site first." }
  if ($user.id -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') { throw 'Unexpected user id format.' }
  Invoke-Sql $project.ref "insert into public.admins (user_id) values ('$($user.id)') on conflict do nothing" | Out-Null
  $count = @(Invoke-Sql $project.ref 'select count(*)::int as n from public.admins')[0].n
  "Admin set: $(Hide-Email $user.email), signed up $($user.created_at), last sign-in $($user.last_sign_in_at). Admins now: $count."
  'Confirm that sign-up time was you and that you can sign in with your own password; if not, remove the row.'
  return
}

# ---- Project: reuse, or create in Mumbai ----
$project = Get-Project
if ($project) {
  "Reusing project $($project.ref) ($($project.region))."
}
else {
  $orgs = @(Invoke-Supa GET '/organizations')
  if ($orgs.Count -eq 0) {
    $orgs = @(Invoke-Supa POST '/organizations' @{ name = 'Personal' })
    'Created an organization (Free).'
  }
  $org = $orgs[0]
  if ($orgs.Count -gt 1) { "Several organizations; using '$($org.name)'." }

  # The database password is generated here, saved first, and never shown.
  $pass = [Environment]::GetEnvironmentVariable('SUPABASE_DB_PASSWORD', 'User')
  if (-not $pass) {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    $pass = -join (1..32 | ForEach-Object { $chars[[Security.Cryptography.RandomNumberGenerator]::GetInt32($chars.Length)] })
    [Environment]::SetEnvironmentVariable('SUPABASE_DB_PASSWORD', $pass, 'User')
  }
  $project = Invoke-Supa POST '/projects' @{
    name              = $projectName
    organization_slug = $org.slug
    region_selection  = @{ type = 'specific'; code = 'ap-south-1' }
    db_pass           = $pass
  }
  $pass = $null
  "Created project $($project.ref) in ap-south-1 (Mumbai)."
}
$ref = $project.ref

# ---- Wait until it is up ----
$deadline = (Get-Date).AddMinutes(10)
while ($true) {
  $status = (Invoke-Supa GET "/projects/$ref").status
  if ($status -eq 'ACTIVE_HEALTHY') { break }
  if ($status -in 'INACTIVE', 'INIT_FAILED', 'REMOVED', 'RESTORE_FAILED', 'PAUSE_FAILED') {
    throw "Project status is $status. Open supabase.com/dashboard/project/$ref to fix it (INACTIVE means paused: press Restore)."
  }
  if ((Get-Date) -gt $deadline) { throw "Project is still $status after 10 minutes. Run this script again later." }
  "Waiting for the project: $status"
  Start-Sleep -Seconds 10
}
'Project is up.'

# ---- Schema (retried: the database can lag a little behind ACTIVE_HEALTHY) ----
$sql = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot '..\db\schema.sql')
for ($attempt = 1; ; $attempt++) {
  try { Invoke-Sql $ref $sql | Out-Null; break }
  catch {
    if ($attempt -ge 6) { throw }
    "Schema attempt $attempt failed, retrying in 15 s: $($_.Exception.Message)"
    Start-Sleep -Seconds 15
  }
}
$tables = @(Invoke-Sql $ref "select count(*)::int as n from pg_tables where schemaname = 'public' and rowsecurity")[0].n
"Schema applied: $tables public tables, all with row-level security."

# ---- Auth: email and password, no confirmation email (the free mailer allows only a few per hour) ----
Invoke-Supa PATCH "/projects/$ref/config/auth" @{
  disable_signup      = $false
  mailer_autoconfirm  = $true
  password_min_length = 8
  site_url            = $siteUrl
  uri_allow_list      = "$siteUrl/**,http://127.0.0.1:8080/**"
} | Out-Null
$auth = Invoke-Supa GET "/projects/$ref/config/auth"
"Auth: sign-up $(if ($auth.disable_signup) { 'OFF' } else { 'on' }), email confirmation $(if ($auth.mailer_autoconfirm) { 'off' } else { 'ON' }), minimum password $($auth.password_min_length)."

# ---- Keys the page may hold: the publishable key (or the legacy anon key) ----
function Find-PublicKey($Keys) {
  foreach ($k in $Keys) {
    if ($k.type -eq 'publishable' -and $k.api_key -is [string] -and $k.api_key -like 'sb_publishable_*') { return $k }
  }
  foreach ($k in $Keys) {
    if ($k.name -eq 'anon' -and $k.api_key -is [string] -and $k.api_key -like 'eyJ*') { return $k }
  }
  return $null
}
$key = Find-PublicKey @(Invoke-Supa GET "/projects/$ref/api-keys?reveal=false")
if (-not $key) { $key = Find-PublicKey @(Invoke-Supa GET "/projects/$ref/api-keys?reveal=true") }
if (-not $key) { throw 'No publishable or anon key found for the project.' }
$value = [string]$key.api_key
# Only a public key may ever reach this variable: the page ships it to every visitor.
if ($value -match '\s' -or $value -like 'sb_secret_*' -or -not ($value -like 'sb_publishable_*' -or $value -like 'eyJ*')) {
  throw 'The key found is not a single publishable key; nothing saved.'
}
[Environment]::SetEnvironmentVariable('SUPABASE_URL', "https://$ref.supabase.co", 'User')
[Environment]::SetEnvironmentVariable('SUPABASE_PUBLISHABLE_KEY', $value, 'User')
"Saved SUPABASE_URL (https://$ref.supabase.co) and SUPABASE_PUBLISHABLE_KEY ($(if ($key.type) { $key.type } else { $key.name }) key, $($value.Length) chars)."
'Done. Next: sign up on the site, then run this script with -MakeAdmin.'
