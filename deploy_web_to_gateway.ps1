param(
    [string]$GatewayUser = "first-gateway",
    [string]$GatewayHost = "10.77.77.1",
    [string]$AppPath = "camerasync",
    [string]$GatewayAlias = "gateway"
)

$ErrorActionPreference = "Stop"

$remote = "$GatewayUser@$GatewayHost"
$remoteWebRoot = "/opt/connectthepads/web"
$remoteAppDir = "$remoteWebRoot/$AppPath"
$sshOptions = @("-o", "PreferredAuthentications=password", "-o", "PubkeyAuthentication=no", "-tt")
$scpOptions = @("-O", "-o", "PreferredAuthentications=password", "-o", "PubkeyAuthentication=no")
$certDir = "/etc/ssl/connectthepads"
$certFile = "$certDir/cert.crt"
$keyFile  = "$certDir/cert.key"

Write-Host "Ensuring remote app directory exists..."
ssh @sshOptions $remote "sudo mkdir -p $remoteAppDir && sudo chown -R ${GatewayUser}:${GatewayUser} $remoteAppDir"

Write-Host "Copying web files to gateway..."
scp @scpOptions -r index.html script.js styles.css vendor "${remote}:$remoteAppDir/"

Write-Host "Configuring local DNS alias and DHCP DNS option..."
ssh @sshOptions $remote "printf '%s\n' 'address=/$GatewayAlias/$GatewayHost' | sudo tee /etc/dnsmasq.d/connectthepads-host-alias.conf > /dev/null"
ssh @sshOptions $remote "if sudo grep -q '^dhcp-option=6,' /etc/dnsmasq.d/dhcp.conf; then sudo sed -i 's/^dhcp-option=6,.*/dhcp-option=6,$GatewayHost/' /etc/dnsmasq.d/dhcp.conf; else printf '%s\n' 'dhcp-option=6,$GatewayHost' | sudo tee -a /etc/dnsmasq.d/dhcp.conf > /dev/null; fi"
ssh @sshOptions $remote "sudo systemctl restart dnsmasq"

Write-Host "Installing nginx and generating self-signed TLS certificate..."
ssh @sshOptions $remote "sudo apt-get install -y nginx openssl"
ssh @sshOptions $remote "sudo mkdir -p $certDir && sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 -keyout $keyFile -out $certFile -subj '/CN=gateway/O=ConnectThePads' -addext 'subjectAltName=IP:$GatewayHost,DNS:$GatewayAlias' 2>/dev/null || true"
ssh @sshOptions $remote "sudo cp $certFile $remoteWebRoot/connectthepads-ca.crt"

Write-Host "Writing nginx configuration..."
$nginxConf = @"
server {
    listen 80 default_server;
    server_name _ $GatewayAlias;
    return 301 https://`$host`$request_uri;
}

server {
    listen 443 ssl default_server;
    server_name _ $GatewayAlias;

    ssl_certificate     $certFile;
    ssl_certificate_key $keyFile;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    root $remoteWebRoot;

    location = / {
        return 301 /$AppPath;
    }

    location /$AppPath {
        try_files `$uri `$uri/ /$AppPath/index.html;
    }

    location /peerjs/ {
        proxy_pass http://127.0.0.1:9000/peerjs/;
        proxy_http_version 1.1;
        proxy_set_header Host `$host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_set_header Upgrade `$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location = /install-cert {
        alias $remoteWebRoot/connectthepads-ca.crt;
        add_header Content-Disposition 'attachment; filename=connectthepads-ca.crt';
        default_type application/x-x509-ca-cert;
    }
}
"@

$tmpConf = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tmpConf, $nginxConf, [System.Text.UTF8Encoding]::new($false))
scp @scpOptions $tmpConf "${remote}:/tmp/connectthepads.nginx"
Remove-Item $tmpConf
ssh @sshOptions $remote "sudo mv /tmp/connectthepads.nginx /etc/nginx/sites-available/connectthepads && sudo chmod 644 /etc/nginx/sites-available/connectthepads"
ssh @sshOptions $remote "sudo ln -sf /etc/nginx/sites-available/connectthepads /etc/nginx/sites-enabled/connectthepads && sudo rm -f /etc/nginx/sites-enabled/default"

Write-Host "Stopping Python service and enabling nginx..."
ssh @sshOptions $remote "sudo systemctl disable --now connectthepads-web.service 2>/dev/null || true"
ssh @sshOptions $remote "sudo systemctl enable nginx && sudo systemctl restart nginx"

Write-Host "Checking nginx status..."
ssh @sshOptions $remote "sudo systemctl --no-pager --full status nginx"

Write-Host ""
Write-Host "Done."
Write-Host "App URL (HTTPS): https://$GatewayAlias/$AppPath"
Write-Host "Fallback URL:    https://${GatewayHost}/$AppPath"
Write-Host "Trust cert (iPad): https://$GatewayAlias/install-cert"
