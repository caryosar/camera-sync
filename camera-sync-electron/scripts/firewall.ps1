# Run from an elevated PowerShell window
$rule = Get-NetFirewallRule -DisplayName "Camera Sync HTTPS" -ErrorAction SilentlyContinue
if (-not $rule) { New-NetFirewallRule -DisplayName "Camera Sync HTTPS" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8443 }
