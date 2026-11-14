<?php

namespace App\Services;

use App\Models\Organization;
use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class EntraTokenValidator
{
    public function validate(string $token): object
    {
        $audience = config('helpdesk.audience');
        if (! $audience) {
            throw new RuntimeException('Entra authentication is not configured.');
        }
        // The unverified tid is a routing hint only. It never establishes identity.
        $parts = explode('.', $token);
        if (count($parts) !== 3 || strlen($token) > 16384) {
            throw new \UnexpectedValueException('Invalid token.');
        }
        $hint = JWT::jsonDecode(JWT::urlsafeB64Decode($parts[1]));
        $tenant = $hint->tid ?? null;
        if (! is_string($tenant) || ! preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i', $tenant)) {
            throw new \UnexpectedValueException('Invalid tenant.');
        }
        $organization = Organization::forDeployment()->where('entra_tenant_id', $tenant)->first();
        if (! $organization || ! $organization->allowed_client_ids) {
            throw new \UnexpectedValueException('Unapproved tenant.');
        }
        // Fixed Microsoft endpoint: never trust a URL from the token header.
        $keys = Cache::remember('entra-jwks:'.$tenant, 3600, fn () => Http::timeout(10)
            ->get("https://login.microsoftonline.com/{$tenant}/discovery/v2.0/keys")->throw()->json());
        try {
            $claims = JWT::decode($token, $this->signingKeys($keys, $tenant));
        } catch (\UnexpectedValueException $exception) {
            // Refresh unknown signing keys at most once per minute for rollover.
            if (! str_contains($exception->getMessage(), '"kid" invalid') || ! Cache::add('entra-refresh:'.$tenant, true, 60)) {
                throw $exception;
            }
            $keys = Http::timeout(10)->get("https://login.microsoftonline.com/{$tenant}/discovery/v2.0/keys")->throw()->json();
            Cache::put('entra-jwks:'.$tenant, $keys, 3600);
            $claims = JWT::decode($token, $this->signingKeys($keys, $tenant));
        }
        foreach (['iss', 'tid', 'aud', 'ver', 'oid', 'azp', 'scp'] as $claim) {
            if (! is_string($claims->$claim ?? null)) {
                throw new \UnexpectedValueException('Invalid access token claims.');
            }
        }
        if (($claims->iss ?? '') !== "https://login.microsoftonline.com/{$tenant}/v2.0"
            || ($claims->tid ?? '') !== $tenant
            || ($claims->aud ?? '') !== $audience
            || ($claims->ver ?? '') !== '2.0'
            || ! isset($claims->exp, $claims->nbf, $claims->oid)
            || ! preg_match('/^[a-f0-9-]{36}$/i', $claims->oid)
            || ! in_array($claims->azp ?? '', $organization->allowed_client_ids, true)
            || ! in_array(config('helpdesk.scope'), explode(' ', $claims->scp ?? ''), true)) {
            throw new \UnexpectedValueException('Invalid API access token.');
        }

        $groups = [];
        // Group overage requires Graph resolution; never interpret a missing list as unrestricted access.
        if (! isset($claims->hasgroups) && ! isset($claims->_claim_names->groups) && isset($claims->groups)) {
            if (! is_array($claims->groups) || count($claims->groups) > 200) {
                throw new \UnexpectedValueException('Invalid group claims.');
            }
            foreach ($claims->groups as $group) {
                if (! is_string($group) || ! preg_match('/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i', $group)) {
                    throw new \UnexpectedValueException('Invalid group identifier.');
                }
                $groups[] = strtolower($group);
            }
        }

        // Translate Microsoft's abbreviated claim names at the application boundary.
        return (object) ['tenant_id' => $claims->tid, 'entra_object_id' => $claims->oid, 'entra_group_ids' => array_values(array_unique($groups)), 'group_claims_expires_at' => (int) $claims->exp];
    }

    private function signingKeys(array $keys, string $tenant): array
    {
        $issuer = "https://login.microsoftonline.com/{$tenant}/v2.0";
        $keys['keys'] = array_values(array_filter($keys['keys'] ?? [], fn ($key) => ($key['kty'] ?? '') === 'RSA'
            && ($key['alg'] ?? 'RS256') === 'RS256'
            && (! isset($key['issuer']) || str_replace('{tenantid}', $tenant, $key['issuer']) === $issuer)));
        if (! $keys['keys']) {
            throw new \UnexpectedValueException('No trusted signing keys.');
        }

        return JWK::parseKeySet($keys, 'RS256');
    }
}
