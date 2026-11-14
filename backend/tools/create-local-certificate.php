<?php

// Development only: creates a certificate for this single Herd test hostname.
// Output stays in Laravel's ignored private storage; no system trust is changed.
$directory = dirname(__DIR__).'/storage/app/private/local-https';
if (! is_dir($directory) && ! mkdir($directory, 0700, true)) {
    throw new RuntimeException('Unable to create certificate directory.');
}
$configuration = <<<'CONFIG'
[req]
distinguished_name = distinguished_name
[distinguished_name]
[server_certificate]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:deskpilot-api.test
CONFIG;
file_put_contents($directory.'/openssl.cnf', $configuration);
$options = ['config' => $directory.'/openssl.cnf', 'private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA, 'digest_alg' => 'sha256', 'x509_extensions' => 'server_certificate'];
$key = openssl_pkey_new($options);
if (! $key) {
    throw new RuntimeException('Unable to generate local key.');
}
$request = openssl_csr_new(['commonName' => 'deskpilot-api.test', 'organizationName' => 'DeskPilot local development'], $key, $options);
$certificate = openssl_csr_sign($request, null, $key, 365, $options, random_int(1, PHP_INT_MAX));
if (! $certificate || ! openssl_x509_export_to_file($certificate, $directory.'/deskpilot-api.test.crt')
    || ! openssl_pkey_export_to_file($key, $directory.'/deskpilot-api.test.key', null, $options)) {
    throw new RuntimeException('Unable to export local certificate.');
}
echo "Created a DeskPilot-only development certificate in private storage.\n";
