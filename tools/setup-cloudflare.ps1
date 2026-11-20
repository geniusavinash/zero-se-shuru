# Creates the Cloudflare Pages project for direct uploads (production branch "main") and reports the address
# Cloudflare gave it. Needs CLOUDFLARE_API_TOKEN (Account > Cloudflare Pages > Edit) and CLOUDFLARE_ACCOUNT_ID.
# Safe to run again. The token is never printed. Run with pwsh 7:  pwsh -File tools\setup-cloudflare.ps1
$ErrorActionPreference = 'Stop'
$token = [Environment]::GetEnvironmentVariable('CLOUDFLARE_API_TOKEN', 'User')
$account = [Environment]::GetEnvironmentVariable('CLOUDFLARE_ACCOUNT_ID', 'User')
if (-not ($token -and $account)) { throw 'Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID with tools\set-keys.ps1 first.' }
$name = 'zero-se-shuru'
$projects = "https://api.cloudflare.com/client/v4/accounts/$account/pages/projects"

function Invoke-Cf([string]$Method, [string]$Uri, $Body) {
  $req = @{ Method = $Method; Uri = $Uri; Headers = @{ Authorization = "Bearer $token" }; ContentType = 'application/json'
    SkipHttpErrorCheck = $true; StatusCodeVariable = 'code' }
  if ($null -ne $Body) { $req.Body = ($Body | ConvertTo-Json -Compress -Depth 5) }
  $res = Invoke-RestMethod @req
  $errors = @($res.errors | ForEach-Object { "$($_.code): $($_.message)" }) -join '; '
  return @{ status = [int]$code; result = $res.result; errors = $errors }
}

$r = Invoke-Cf GET "$projects/$name"
if ($r.status -eq 200) {
  "Project $name already exists."
}
elseif ($r.status -eq 404) {
  $r = Invoke-Cf POST $projects @{ name = $name; production_branch = 'main' }
  if ($r.status -ne 200) { throw "Could not create the project (HTTP $($r.status)): $($r.errors)" }
  "Created project $name (production branch main)."
}
else {
  throw "Cloudflare answered HTTP $($r.status): $($r.errors). Check that the token has Account > Cloudflare Pages > Edit and that the account id is right."
}

$address = "https://$($r.result.subdomain)"
"Address: $address"
$configured = (Select-String -Path (Join-Path $PSScriptRoot '..\config\site.yaml') -Pattern '^public_url:\s*(\S+)').Matches[0].Groups[1].Value
if ($configured -ne $address) {
  "NOTE: config/site.yaml has public_url $configured, but Cloudflare gave $address. Update public_url, then run tools\setup-supabase.ps1 again so sign-in redirects match."
}
else { 'config/site.yaml public_url matches.' }
