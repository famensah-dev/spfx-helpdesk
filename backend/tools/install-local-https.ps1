[CmdletBinding(SupportsShouldProcess)]
param()

$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path -Parent $PSScriptRoot
$certificateDirectory = Join-Path $backendRoot 'storage/app/private/local-https'
$certificatePath = Join-Path $certificateDirectory 'deskpilot-api.test.crt'
$keyPath = Join-Path $certificateDirectory 'deskpilot-api.test.key'
$herdRoot = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.config/herd'
$herdCertificates = Join-Path $herdRoot 'config/valet/Certificates'
$hostsPath = Join-Path ([Environment]::GetFolderPath('System')) 'drivers/etc/hosts'
$certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($certificatePath)

if ($certificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::DnsName, $false) -ne 'deskpilot-api.test' -or $certificate.NotAfter -le (Get-Date)) {
    throw 'The prepared DeskPilot certificate has the wrong hostname or is expired.'
}
if (!(Test-Path -LiteralPath $keyPath) -or !(Test-Path -LiteralPath (Join-Path $herdRoot 'config/valet/Nginx/deskpilot-api.test.conf'))) {
    throw 'Prepare the certificate and Herd site before running this installer.'
}

$hasHostEntry = $false
foreach ($line in [IO.File]::ReadAllLines($hostsPath)) {
    $parts = (($line -split '#', 2)[0].Trim() -split '\s+')
    if ($parts.Count -gt 1 -and $parts[1..($parts.Count - 1)] -contains 'deskpilot-api.test') {
        if ($parts[0] -ne '127.0.0.1') { throw 'deskpilot-api.test already points to another address.' }
        $hasHostEntry = $true
    }
}

if (!$PSCmdlet.ShouldProcess('deskpilot-api.test', 'Trust its prepared certificate for this Windows user, install its Herd certificate/key, and add its loopback hosts entry')) { return }
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this installer from an elevated PowerShell process; updating the Windows hosts file requires administrator access.'
}

$backupDirectory = Join-Path $certificateDirectory ('before-install-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backupDirectory | Out-Null
Copy-Item -LiteralPath $hostsPath -Destination (Join-Path $backupDirectory 'hosts')
foreach ($name in @('deskpilot-api.test.crt', 'deskpilot-api.test.key')) {
    $existingPath = Join-Path $herdCertificates $name
    if (Test-Path -LiteralPath $existingPath) { Copy-Item -LiteralPath $existingPath -Destination (Join-Path $backupDirectory $name) }
}

Import-Certificate -FilePath $certificatePath -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
Copy-Item -LiteralPath $certificatePath -Destination (Join-Path $herdCertificates 'deskpilot-api.test.crt') -Force
Copy-Item -LiteralPath $keyPath -Destination (Join-Path $herdCertificates 'deskpilot-api.test.key') -Force
if (!$hasHostEntry) { Add-Content -LiteralPath $hostsPath -Value "`r`n127.0.0.1 deskpilot-api.test" -Encoding Ascii }
Clear-DnsClientCache
& (Join-Path $herdRoot 'bin/herd.bat') restart nginx
if ($LASTEXITCODE -ne 0) { throw 'Herd restart failed.' }
@{ hostname = 'deskpilot-api.test'; thumbprint = $certificate.Thumbprint; backup = $backupDirectory; installed_at = [DateTime]::UtcNow.ToString('o') } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $certificateDirectory 'installed.json')
Write-Output 'DeskPilot local HTTPS is installed.'
