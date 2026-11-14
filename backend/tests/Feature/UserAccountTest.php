<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class UserAccountTest extends TestCase
{
    use RefreshDatabase;

    public function test_users_can_exist_without_an_entra_identity_and_passwords_are_hashed(): void
    {
        $user = User::create(['name' => 'Independent', 'email' => 'local@example.com', 'password' => 'a-long-test-password']);
        $this->assertNull($user->fresh()->entra_object_id);
        $this->assertNull($user->fresh()->tenant_id);
        $this->assertFalse($user->fresh()->enabled);
        $this->assertSame('requester', $user->fresh()->role);
        $this->assertTrue(Hash::check('a-long-test-password', $user->password));
        $this->assertArrayNotHasKey('password', $user->toArray());
        $this->assertFalse(Schema::hasTable('members'));
        $this->assertFalse(Schema::hasColumn('users', 'oid'));
    }

    public function test_multiple_organizations_and_users_can_exist_without_entra_identities(): void
    {
        foreach (['one', 'two'] as $name) {
            $organization = Organization::create(['slug' => 'local-'.$name, 'name' => $name, 'status' => 'active', 'allowed_client_ids' => []]);
            User::create(['organization_id' => $organization->id, 'name' => 'Local '.$name, 'email' => 'same@example.com']);
        }
        $this->assertDatabaseCount('organizations', 2);
        $this->assertDatabaseCount('users', 2);
        $this->assertSame(2, User::whereNull('tenant_id')->whereNull('entra_object_id')->count());
    }
}
