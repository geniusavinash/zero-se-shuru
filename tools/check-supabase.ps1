# Live check of the Supabase rules with a throwaway account: what a signed-in student can and cannot do,
# and what changes once that account is an admin. Everything it creates is deleted at the end.
# Needs SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_ACCESS_TOKEN. Run with pwsh 7:
#   pwsh -File tools\check-supabase.ps1
$ErrorActionPreference = 'Stop'
$url = [Environment]::GetEnvironmentVariable('SUPABASE_URL', 'User')
$pub = [Environment]::GetEnvironmentVariable('SUPABASE_PUBLISHABLE_KEY', 'User')
$pat = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'User')
if (-not ($url -and $pub -and $pat)) { throw 'Run tools\setup-supabase.ps1 first.' }
# Only a real Supabase project address; the ref from it is used in privileged SQL calls (review fix, round 2).
if ($url -notmatch '^https://[a-z0-9]{20}\.supabase\.co$') { throw 'SUPABASE_URL is not a https://<ref>.supabase.co address.' }
# Every row this run creates carries its own tag, so cleanup removes only this run's rows.
$tag = "rls-check-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
$ref = ([Uri]$url).Host.Split('.')[0]
$email = "rls-check-$([guid]::NewGuid().ToString('N').Substring(0, 8))@example.com"
$password = [guid]::NewGuid().ToString('N')
$failures = 0

function Invoke-Sql([string]$Query) {
  $res = Invoke-RestMethod -Method Post -Uri "https://api.supabase.com/v1/projects/$ref/database/query" `
    -Headers @{ Authorization = "Bearer $pat" } -ContentType 'application/json' -Body (@{ query = $Query } | ConvertTo-Json -Compress)
  return $res
}

# One REST call as the given token; returns status and data instead of throwing.
function Invoke-As([string]$Token, [string]$Method, [string]$Path, $Body) {
  $req = @{ Method = $Method; Uri = "$url$Path"; ContentType = 'application/json'
    Headers = @{ apikey = $pub; Authorization = "Bearer $Token"; Prefer = 'return=representation' } }
  if ($null -ne $Body) { $req.Body = ($Body | ConvertTo-Json -Compress -Depth 5) }
  try { $data = Invoke-RestMethod @req -StatusCodeVariable code; return @{ status = [int]$code; data = $data } }
  catch { return @{ status = [int]$_.Exception.Response.StatusCode.value__; data = $null } }
}

function Expect([string]$What, [bool]$Ok) {
  if (-not $Ok) { $script:failures++ }
  '{0} {1}' -f $(if ($Ok) { 'PASS' } else { 'FAIL' }), $What
}

$uid = $null
try {
  $signup = Invoke-RestMethod -Method Post -Uri "$url/auth/v1/signup" -Headers @{ apikey = $pub } -ContentType 'application/json' `
    -Body (@{ email = $email; password = $password } | ConvertTo-Json -Compress)
  $token = $signup.access_token
  $uid = [string]$signup.user.id
  if ($uid -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') { $uid = $null; throw 'Sign-up returned no valid user id.' }
  Expect 'sign-up works without a confirmation email' ([bool]$token)

  # As a signed-in student
  $r = Invoke-As $token POST '/rest/v1/saved_jobs' @{ user_id = $uid; job_key = "${tag}:1"; status = 'saved' }
  Expect "student saves a job for themself (HTTP $($r.status))" ($r.status -eq 201)
  $r = Invoke-As $token GET '/rest/v1/saved_jobs?select=job_key'
  Expect "student reads back exactly their own save ($(@($r.data).Count) row)" (@($r.data).Count -eq 1)
  $r = Invoke-As $token POST '/rest/v1/saved_jobs' @{ user_id = [guid]::NewGuid().ToString(); job_key = "${tag}:2" }
  Expect "student cannot save for another user (HTTP $($r.status), row-level security)" ($r.status -eq 403)
  $r = Invoke-As $token POST '/rest/v1/hidden_posts' @{ job_key = $tag; reason = 'check' }
  Expect "student cannot hide a post (HTTP $($r.status))" ($r.status -eq 403)
  $r = Invoke-As $token POST '/rest/v1/admins' @{ user_id = $uid }
  Expect "student cannot make themself admin (HTTP $($r.status))" ($r.status -eq 403)
  $r = Invoke-As $token POST '/rest/v1/rpc/is_admin' @{}
  Expect "is_admin is false for a student" ($r.data -eq $false)
  $r = Invoke-As $token POST '/rest/v1/rpc/admin_stats' @{}
  Expect "student cannot read admin stats (HTTP $($r.status))" ($r.status -ge 400)

  # The same account made admin (by user id, as tools/setup-supabase.ps1 -MakeAdmin does)
  Invoke-Sql "insert into public.admins (user_id) values ('$uid') on conflict do nothing" | Out-Null
  $r = Invoke-As $token POST '/rest/v1/rpc/is_admin' @{}
  Expect "is_admin is true after the admin row is added" ($r.data -eq $true)
  $r = Invoke-As $token POST '/rest/v1/hidden_posts' @{ job_key = $tag; reason = 'check' }
  Expect "admin hides a post (HTTP $($r.status))" ($r.status -eq 201)
  $r = Invoke-As $token GET '/rest/v1/admin_audit?select=table_name,action&table_name=eq.hidden_posts'
  Expect "the change is in the admin audit log ($(@($r.data).Count) row)" (@($r.data).Count -ge 1)
  $r = Invoke-As $pub GET '/rest/v1/admin_audit?select=id'
  Expect "a visitor cannot read the audit log (HTTP $($r.status))" (($r.status -in 401, 403) -or ($r.status -eq 200 -and @($r.data | Where-Object { $_ }).Count -eq 0))
  $r = Invoke-As $token DELETE "/rest/v1/hidden_posts?job_key=eq.$tag" $null
  Expect "admin removes the override (HTTP $($r.status))" ($r.status -in 200, 204)
  $r = Invoke-As $token POST '/rest/v1/rpc/admin_stats' @{}
  Expect "admin reads the account counts (users: $($r.data.users))" ($r.status -eq 200 -and $r.data.users -ge 1)
}
finally {
  if ($uid) {
    Invoke-Sql "delete from public.admin_audit where row_data->>'job_key' like '$tag%'; delete from auth.users where id = '$uid'" | Out-Null
    $left = @(Invoke-Sql "select count(*)::int as n from auth.users where email like 'rls-check-%@example.com'")[0].n
    "Cleanup: throwaway account and its rows deleted ($left left)."
  }
}
if ($failures -gt 0) { "$failures check(s) FAILED"; exit 1 } else { 'All checks passed.' }
