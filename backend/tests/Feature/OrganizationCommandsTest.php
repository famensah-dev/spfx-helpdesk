<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class OrganizationCommandsTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_onboard_and_bootstrap_each_organization_independently(): void
    {
        foreach (['hospital', 'customer'] as $slug) {
            $tenant = (string) Str::uuid();
            $client = (string) Str::uuid();
            $this->artisan('helpdesk:organization-create', ['slug' => $slug, 'name' => ucfirst($slug), 'entra_tenant_id' => $tenant, '--client-id' => [$client], '--actor' => 'operator@example.com'])->assertSuccessful();
            $oid = (string) Str::uuid();
            $this->artisan('helpdesk:bootstrap-admin', ['organization' => $slug, 'entra_object_id' => $oid, 'email' => 'admin@example.com', 'name' => 'First Admin'])->assertSuccessful();
            $organization = Organization::where('slug', $slug)->firstOrFail();
            $this->assertSame([$client], $organization->allowed_client_ids);
            $this->assertDatabaseHas('users', ['organization_id' => $organization->id, 'tenant_id' => $tenant, 'entra_object_id' => $oid, 'role' => 'superAdmin']);
            $this->assertDatabaseHas('organization_events', ['organization_id' => $organization->id, 'actor' => 'operator@example.com', 'action' => 'organization.created']);
            $this->artisan('helpdesk:bootstrap-admin', ['organization' => $slug, 'entra_object_id' => (string) Str::uuid(), 'email' => 'other@example.com', 'name' => 'Other Admin'])->assertFailed();
        }
        $this->assertDatabaseCount('users', 2);
        $this->assertDatabaseCount('audit_events', 2);
    }

    public function test_owner_access_changes_are_audited_and_preserve_accounts(): void
    {
        $organization = Organization::create(['slug' => 'hospital', 'name' => 'Hospital', 'entra_tenant_id' => (string) Str::uuid(), 'allowed_client_ids' => [(string) Str::uuid()], 'status' => 'active']);
        User::create(['organization_id' => $organization->id, 'name' => 'Local', 'email' => 'local@example.com']);
        $options = ['slug' => 'hospital', '--actor' => 'operator@example.com', '--reason' => 'Customer agreement'];
        $this->artisan('helpdesk:organization-access', [...$options, '--status' => 'suspended'])->assertSuccessful();
        $this->assertFalse($organization->fresh()->allowsAccess());
        $this->assertDatabaseHas('organization_events', ['organization_id' => $organization->id, 'reason' => 'Customer agreement', 'action' => 'organization.updated']);
        $this->artisan('helpdesk:organization-access', [...$options, '--status' => 'trial', '--expires-at' => now()->subMinute()->toISOString()])->assertSuccessful();
        $this->assertFalse($organization->fresh()->allowsAccess());
        $newClient = (string) Str::uuid();
        $this->artisan('helpdesk:organization-access', [...$options, '--status' => 'active', '--no-expiry' => true, '--client-id' => [$newClient]])->assertSuccessful();
        $this->assertTrue($organization->fresh()->allowsAccess());
        $this->assertSame([$newClient], $organization->fresh()->allowed_client_ids);
        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseCount('organization_events', 3);
        $this->artisan('helpdesk:organization-access', [...$options, '--no-expiry' => true, '--expires-at' => now()->toISOString()])->assertFailed();
        $this->assertDatabaseCount('organization_events', 3);
    }
}
