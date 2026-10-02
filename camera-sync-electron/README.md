# Camera Sync Electron Windows Package

Self-contained Electron host for the Camera Sync browser app. It starts an HTTPS Express server and an embedded PeerJS signaling server on TCP 8443.

## Build the Windows installer
1. Install Node.js LTS and Git on a Windows x64 computer.
2. Extract this project.
3. Open PowerShell in the project folder.
4. Run `powershell -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1`.
5. Find `CameraSyncSetup.exe` under `out\make\squirrel.windows\x64`.

## Development
- `npm install`
- `npm start`

## LAN use
Run `scripts\firewall.ps1` as administrator. The app shows the receiver URL. Other devices must be on the same LAN and must explicitly trust the app's local self-signed certificate before camera APIs and WebSockets will work reliably.

## Production hardening
- Replace runtime self-signed certificates with an organization-issued certificate.
- Code-sign the installer and executable.
- Review firewall scope and bind rules with IT.
- Validate on Windows 11 x64 and all target mobile browsers.

## Notes
This package is build-ready source. It does not contain a precompiled Windows executable because the current build environment is Linux and cannot validate Windows signing, Squirrel installation, firewall behavior, or camera permissions.

## Verification
Run `npm run check` and `npm run audit:prod` after `npm install`. Security tests cover process isolation, navigation restrictions, permissions, CSP, rate limiting, input validation, command validation, UI element wiring, and Squirrel startup handling.
