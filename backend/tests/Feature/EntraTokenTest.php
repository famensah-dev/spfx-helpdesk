<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Services\EntraTokenValidator;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class EntraTokenTest extends TestCase
{
    use RefreshDatabase;

    private string $privateKey = '';

    private array $claims;

    protected function setUp(): void
    {
        parent::setUp();
        $options = ['config' => __DIR__.'/../openssl.cnf', 'private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA];
        $key = openssl_pkey_new($options);
        openssl_pkey_export($key, $this->privateKey, null, $options);
        $details = openssl_pkey_get_details($key);
        $tenant = '11111111-1111-4111-8111-111111111111';
        config(['helpdesk.deployment_mode' => 'shared', 'helpdesk.audience' => 'api-client']);
        Organization::create(['slug' => 'test-hospital', 'name' => 'Hospital', 'entra_tenant_id' => $tenant, 'status' => 'active', 'allowed_client_ids' => ['spfx-client']]);
        $this->claims = ['iss' => "https://login.microsoftonline.com/{$tenant}/v2.0", 'tid' => $tenant, 'aud' => 'api-client', 'azp' => 'spfx-client', 'ver' => '2.0', 'oid' => '22222222-2222-4222-8222-222222222222', 'scp' => 'access_as_user', 'nbf' => time() - 5, 'exp' => time() + 300];
        Http::preventStrayRequests();
        Http::fake(['login.microsoftonline.com/*' => Http::response(['keys' => [['kty' => 'RSA', 'kid' => 'test-key', 'alg' => 'RS256', 'use' => 'sig', 'n' => JWT::urlsafeB64Encode($details['rsa']['n']), 'e' => JWT::urlsafeB64Encode($details['rsa']['e'])]]])]);
    }

    public function test_signed_access_token_is_validated(): void
    {
        $token = JWT::encode($this->claims, $this->privateKey, 'RS256', 'test-key');
        $this->assertSame($this->claims['oid'], app(EntraTokenValidator::class)->validate($token)->entra_object_id);
        $identity = app(EntraTokenValidator::class)->validate($token);
        $this->assertSame($this->claims['tid'], $identity->tenant_id);
        $this->assertFalse(property_exists($identity, 'tid'));
        $this->assertFalse(property_exists($identity, 'oid'));
    }

    public function test_group_ids_are_taken_only_from_verified_tokens_and_overage_grants_none(): void
    {
        $group = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
        $claims = [...$this->claims, 'groups' => [$group]];
        $validator = app(EntraTokenValidator::class);
        $identity = $validator->validate(JWT::encode($claims, $this->privateKey, 'RS256', 'test-key'));
        $this->assertSame([strtolower($group)], $identity->entra_group_ids);
        $claims['_claim_names'] = ['groups' => 'src1'];
        $identity = $validator->validate(JWT::encode($claims, $this->privateKey, 'RS256', 'test-key'));
        $this->assertSame([], $identity->entra_group_ids);
    }

    public function test_wrong_audience_tenant_issuer_scope_client_and_expiration_are_rejected(): void
    {
        foreach (['aud' => 'graph', 'tid' => 'other-tenant', 'iss' => 'https://attacker.example', 'scp' => 'User.Read', 'azp' => 'other-client', 'exp' => time() - 60, 'nbf' => time() + 300] as $key => $value) {
            $claims = [...$this->claims, $key => $value];
            try {
                app(EntraTokenValidator::class)->validate(JWT::encode($claims, $this->privateKey, 'RS256', 'test-key'));
                $this->fail("Accepted invalid {$key}");
            } catch (\UnexpectedValueException $exception) {
                $this->assertNotEmpty($exception->getMessage());
            }
        }
    }

    public function test_forged_signature_and_unsigned_tokens_are_rejected_by_api(): void
    {
        $forged = JWT::encode($this->claims, str_repeat('attacker-secret', 4), 'HS256', 'test-key');
        $this->withToken($forged)->getJson('/api/v1/session')->assertUnauthorized();
        $unsigned = JWT::urlsafeB64Encode('{"alg":"none"}').'.'.JWT::urlsafeB64Encode(json_encode($this->claims)).'.';
        $this->withToken($unsigned)->getJson('/api/v1/session')->assertUnauthorized();
    }

    public function test_second_approved_tenant_uses_its_own_client_allowlist(): void
    {
        $tenant = '44444444-4444-4444-8444-444444444444';
        Organization::create(['slug' => 'other', 'name' => 'Other', 'entra_tenant_id' => $tenant, 'status' => 'active', 'allowed_client_ids' => ['other-client']]);
        $claims = [...$this->claims, 'tid' => $tenant, 'iss' => "https://login.microsoftonline.com/{$tenant}/v2.0", 'azp' => 'other-client'];
        $validator = app(EntraTokenValidator::class);
        $this->assertSame($tenant, $validator->validate(JWT::encode($claims, $this->privateKey, 'RS256', 'test-key'))->tenant_id);
        $this->expectException(\UnexpectedValueException::class);
        $validator->validate(JWT::encode([...$claims, 'azp' => 'spfx-client'], $this->privateKey, 'RS256', 'test-key'));
    }

    public function test_unknown_tenant_is_rejected_without_fetching_signing_keys(): void
    {
        $claims = [...$this->claims, 'tid' => '55555555-5555-4555-8555-555555555555'];
        try {
            app(EntraTokenValidator::class)->validate(JWT::encode($claims, $this->privateKey, 'RS256', 'test-key'));
            $this->fail('Unknown tenant accepted.');
        } catch (\UnexpectedValueException $exception) {
            Http::assertNothingSent();
        }
    }

    public function test_unverified_tenant_hint_does_not_allow_a_forged_token(): void
    {
        $token = JWT::encode($this->claims, $this->privateKey, 'RS256', 'test-key');
        $parts = explode('.', $token);
        $parts[1] = JWT::urlsafeB64Encode(json_encode([...$this->claims, 'oid' => '66666666-6666-4666-8666-666666666666']));
        $this->withToken(implode('.', $parts))->getJson('/api/v1/session')->assertUnauthorized();
    }

    public function test_signing_key_for_another_issuer_is_not_trusted(): void
    {
        Cache::flush();
        Http::swap(new Factory);
        Http::preventStrayRequests();
        $key = openssl_pkey_get_details(openssl_pkey_get_private($this->privateKey));
        Http::fake(['login.microsoftonline.com/*' => Http::response(['keys' => [['kty' => 'RSA', 'kid' => 'test-key', 'alg' => 'RS256', 'issuer' => 'https://attacker.example', 'n' => JWT::urlsafeB64Encode($key['rsa']['n']), 'e' => JWT::urlsafeB64Encode($key['rsa']['e'])]]])]);
        $this->expectException(\UnexpectedValueException::class);
        app(EntraTokenValidator::class)->validate(JWT::encode($this->claims, $this->privateKey, 'RS256', 'test-key'));
    }

    public function test_replacing_trusted_clients_revokes_an_existing_signed_token(): void
    {
        $token = JWT::encode($this->claims, $this->privateKey, 'RS256', 'test-key');
        $validator = app(EntraTokenValidator::class);
        $validator->validate($token);
        Organization::firstOrFail()->update(['allowed_client_ids' => ['replacement-client']]);
        $this->expectException(\UnexpectedValueException::class);
        $validator->validate($token);
    }
}
