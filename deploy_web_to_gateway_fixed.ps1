param(
    [string]$GatewayUser = "first-gateway",
    [string]$GatewayHost = "10.77.77.1",
    [int]$WebPort = 8080
)

$ErrorActionPreference = "Stop"

$remote = "$GatewayUser@$GatewayHost"
$remoteAppDir = "/opt/connectthepads/web"
$serviceName = "connectthepads-web.service"

Write-Host "Ensuring remote app directory exists..."
ssh $remote "sudo mkdir -p $remoteAppDir && sudo chown -R `${GatewayUser}:${GatewayUser} $remoteAppDir"

Write-Host "Copying web files to gateway..."
scp index.html script.js styles.css "${remote}:$remoteAppDir/"

Write-Host "Installing systemd service for static hosting..."
$serviceContent = @"
[Unit]
Description=ConnectThePads Static Web App
After=network.target

[Service]
Type=simple
User=$GatewayUser
WorkingDirectory=$remoteAppDir
ExecStart=/usr/bin/python3 -m http.server $WebPort --bind 0.0.0.0 --directory $remoteAppDir
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
"@

$escaped = $serviceContent -replace "'", "'\\''"
ssh $remote "printf '%s' '$escaped' | sudo tee /etc/systemd/system/$serviceName > /dev/null"

Write-Host "Reloading systemd and starting service..."
ssh $remote "sudo systemctl daemon-reload && sudo systemctl enable $serviceName && sudo systemctl restart $serviceName"

Write-Host "Checking service status..."
ssh $remote "sudo systemctl --no-pager --full status $serviceName"

Write-Host "Done. App URL: http://`${GatewayHost}:${WebPort}"


