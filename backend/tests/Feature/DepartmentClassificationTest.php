<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\Ticket;
use App\Models\User;
use App\Services\DepartmentAccess;
use App\Services\EntraTokenValidator;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class DepartmentClassificationTest extends TestCase
{
    use RefreshDatabase;

    private Organization $org;

    private int $it;

    private int $facilities;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        config(['helpdesk.deployment_mode' => 'shared']);
        $this->org = Organization::create(['slug' => 'hospital', 'name' => 'Hospital', 'entra_tenant_id' => (string) Str::uuid(), 'allowed_client_ids' => [], 'status' => 'active']);
        $this->it = DB::table('departments')->insertGetId(['organization_id' => $this->org->id, 'name' => 'IT']);
        $this->facilities = DB::table('departments')->insertGetId(['organization_id' => $this->org->id, 'name' => 'Facilities']);
        $this->owner = $this->user('superAdmin');
    }

    private function user(string $role, array $departments = []): User
    {
        $id = (string) Str::uuid();
        $user = User::create(['organization_id' => $this->org->id, 'name' => $role, 'email' => $id.'@example.com', 'entra_object_id' => $id, 'tenant_id' => $this->org->entra_tenant_id, 'role' => $role, 'enabled' => true]);
        foreach ($departments as $department) {
            DB::table('department_memberships')->insert(['organization_id' => $this->org->id, 'department_id' => $department, 'user_id' => $user->id]);
        }

        return $user;
    }

    private function asUser(User $user): static
    {
        $this->mock(EntraTokenValidator::class)->shouldReceive('validate')->andReturn((object) ['tenant_id' => $user->tenant_id, 'entra_object_id' => $user->entra_object_id]);

        return $this->withToken('test-token');
    }

    private function ticket(User $requester, int $department, ?User $agent = null, ?User $creator = null): Ticket
    {
        return Ticket::create(['organization_id' => $this->org->id, 'department_id' => $department, 'requester_id' => $requester->id, 'created_by_id' => ($creator ?? $requester)->id, 'assigned_to_id' => $agent?->id, 'title' => 'Help', 'status' => 'New', 'priority' => 'Low']);
    }

    private function category(string $name, array $departments = []): int
    {
        $id = DB::table('categories')->insertGetId(['organization_id' => $this->org->id, 'name' => $name]);
        foreach ($departments as $department) {
            DB::table('category_departments')->insert(['organization_id' => $this->org->id, 'category_id' => $id, 'department_id' => $department]);
        }

        return $id;
    }

    public function test_department_admin_cannot_read_or_mutate_other_department_tickets(): void
    {
        $admin = $this->user('admin', [$this->it]);
        $own = $this->ticket($this->owner, $this->it);
        $other = $this->ticket($this->owner, $this->facilities);
        $this->asUser($admin)->getJson('/api/v1/tickets')->assertOk()->assertJsonCount(1, 'tickets')->assertJsonPath('tickets.0.Id', $own->id);
        $this->patchJson('/api/v1/tickets/'.$other->id, ['status' => 'Closed'])->assertForbidden();
        $this->getJson('/api/v1/tickets/'.$other->id.'/comments')->assertForbidden();
        $this->getJson('/api/v1/tickets/'.$other->id.'/history')->assertForbidden();
        $this->postJson('/api/v1/tickets/'.$other->id.'/response')->assertForbidden();
        $this->asUser($this->owner)->getJson('/api/v1/tickets')->assertJsonCount(2, 'tickets');
    }

    public function test_membership_supports_multiple_departments_and_revocation_is_immediate(): void
    {
        $admin = $this->user('admin', [$this->it, $this->facilities]);
        $this->ticket($this->owner, $this->it);
        $this->ticket($this->owner, $this->facilities);
        $this->asUser($admin)->getJson('/api/v1/tickets')->assertJsonCount(2, 'tickets');
        DB::table('department_memberships')->where('user_id', $admin->id)->where('department_id', $this->facilities)->delete();
        $this->getJson('/api/v1/tickets')->assertJsonCount(1, 'tickets');
    }

    public function test_group_mapping_grants_only_department_membership_and_is_scoped_to_organization(): void
    {
        $group = (string) Str::uuid();
        DB::table('department_entra_groups')->insert(['organization_id' => $this->org->id, 'department_id' => $this->it, 'entra_group_id' => $group]);
        $user = $this->user('requester');
        $this->ticket($user, $this->it);
        $this->ticket($this->owner, $this->it);
        $this->ticket($user, $this->facilities);
        $this->asUser($user)->getJson('/api/v1/tickets')->assertJsonCount(0, 'tickets');
        $this->mock(EntraTokenValidator::class)->shouldReceive('validate')->andReturn((object) ['tenant_id' => $user->tenant_id, 'entra_object_id' => $user->entra_object_id, 'entra_group_ids' => [$group]]);
        $this->getJson('/api/v1/tickets')->assertJsonCount(1, 'tickets');
        $this->getJson('/api/v1/session')->assertJsonPath('access.role', 'requester');
        DB::table('department_entra_groups')->delete();
        $this->getJson('/api/v1/tickets')->assertJsonCount(0, 'tickets');
    }

    public function test_requester_and_agent_creator_and_requester_visibility_are_distinct(): void
    {
        $requester = $this->user('requester', [$this->it]);
        $agent = $this->user('agent', [$this->it]);
        $this->ticket($requester, $this->it, null, $agent);
        $this->ticket($agent, $this->it, null, $this->owner);
        $this->ticket($this->owner, $this->it, $agent);
        $this->asUser($requester)->getJson('/api/v1/tickets')->assertJsonCount(1, 'tickets');
        $this->asUser($agent)->getJson('/api/v1/tickets')->assertJsonCount(2, 'tickets');
    }

    public function test_assignee_group_evidence_must_be_unexpired_and_match_department(): void
    {
        $group = (string) Str::uuid();
        $agent = $this->user('agent');
        DB::table('department_entra_groups')->insert(['organization_id' => $this->org->id, 'department_id' => $this->it, 'entra_group_id' => $group]);
        DB::table('user_entra_group_cache')->insert(['organization_id' => $this->org->id, 'user_id' => $agent->id, 'entra_group_id' => $group, 'expires_at' => now()->addMinutes(5)]);
        $base = ['title' => 'Assigned', 'priority' => 'Low', 'departmentId' => $this->it, 'assignedToId' => $agent->id];
        $this->asUser($this->owner)->postJson('/api/v1/tickets', $base)->assertCreated();
        $this->postJson('/api/v1/tickets', [...$base, 'departmentId' => $this->facilities])->assertUnprocessable();
        DB::table('user_entra_group_cache')->where('user_id', $agent->id)->update(['expires_at' => now()->subSecond()]);
        $this->postJson('/api/v1/tickets', $base)->assertUnprocessable();
    }

    public function test_department_role_settings_change_server_visibility_and_permissions(): void
    {
        $admin = $this->user('admin', [$this->it]);
        $agent = $this->user('agent', [$this->it]);
        $ticket = $this->ticket($this->owner, $this->it);
        $this->asUser($agent)->getJson('/api/v1/tickets')->assertJsonCount(0, 'tickets');
        $roles = ['agent' => ['name' => 'Agent', 'scope' => 'all', 'actions' => ['tickets', 'comment']], 'admin' => ['name' => 'Admin', 'scope' => 'all', 'actions' => DepartmentAccess::ACTIONS]];
        $this->asUser($admin)->patchJson('/api/v1/departments/'.$this->it, ['roles' => $roles])->assertNoContent();
        $this->patchJson('/api/v1/departments/'.$this->facilities, ['roles' => $roles])->assertNotFound();
        $this->asUser($agent)->getJson('/api/v1/tickets')->assertJsonCount(1, 'tickets');
        $this->patchJson('/api/v1/tickets/'.$ticket->id, ['status' => 'Resolved'])->assertForbidden();
        $this->postJson('/api/v1/tickets/'.$ticket->id.'/response')->assertForbidden();
        $this->postJson('/api/v1/tickets/'.$ticket->id.'/comments', ['text' => 'Seen'])->assertNoContent();
    }

    public function test_only_owner_can_grant_department_memberships_and_map_groups(): void
    {
        $admin = $this->user('admin', [$this->it]);
        $this->asUser($admin)->patchJson('/api/v1/departments/'.$this->it, ['member_ids' => [$admin->id]])->assertForbidden();
        $group = (string) Str::uuid();
        $this->asUser($this->owner)->patchJson('/api/v1/departments/'.$this->it, ['member_ids' => [$admin->id], 'entra_group_ids' => [$group]])->assertNoContent();
        $this->assertDatabaseHas('department_entra_groups', ['department_id' => $this->it, 'entra_group_id' => $group]);
        $this->patchJson('/api/v1/departments/'.$this->it, ['roles' => ['agent' => ['name' => 'Agent', 'scope' => 'invalid', 'actions' => []]]])->assertUnprocessable();
    }

    public function test_create_cannot_bypass_status_permission_and_only_creator_edits_content(): void
    {
        $admin = $this->user('admin', [$this->it]);
        $ticket = $this->ticket($this->owner, $this->it);
        $this->asUser($admin)->patchJson('/api/v1/tickets/'.$ticket->id, ['title' => 'Rewritten'])->assertForbidden();
        DB::table('departments')->where('id', $this->it)->update(['role_settings' => json_encode(['admin' => ['name' => 'Admin', 'scope' => 'all', 'actions' => ['tickets', 'create', 'edit']]])]);
        $this->postJson('/api/v1/tickets', ['title' => 'Closed', 'priority' => 'Low', 'departmentId' => $this->it, 'status' => 'Closed'])->assertForbidden();
        $this->postJson('/api/v1/tickets', ['title' => 'New', 'priority' => 'Low', 'departmentId' => $this->it])->assertCreated();
    }

    public function test_agent_all_scope_does_not_remove_creator_only_assignment_rule(): void
    {
        $agent = $this->user('agent', [$this->it]);
        $other = $this->user('agent', [$this->it]);
        DB::table('departments')->where('id', $this->it)->update(['role_settings' => json_encode(['agent' => ['name' => 'Agent', 'scope' => 'all', 'actions' => DepartmentAccess::ACTIONS]])]);
        $ticket = $this->ticket($this->owner, $this->it, $agent);
        $this->asUser($agent)->patchJson('/api/v1/tickets/'.$ticket->id, ['assignedToId' => $other->id])->assertForbidden();
        $own = $this->ticket($agent, $this->it);
        $this->patchJson('/api/v1/tickets/'.$own->id, ['assignedToId' => $other->id])->assertNoContent();
    }

    public function test_lookup_options_and_ticket_validation_respect_department_and_parent(): void
    {
        $shared = $this->category('General');
        $it = $this->category('Computers', [$this->it]);
        $facilities = $this->category('Plumbing', [$this->facilities]);
        $sub = DB::table('subcategories')->insertGetId(['organization_id' => $this->org->id, 'category_id' => $it, 'name' => 'Printers']);
        $requester = $this->user('requester', [$this->it]);
        $this->asUser($requester)->getJson('/api/v1/ticket-options')->assertJsonCount(2, 'classification.categories');
        $base = ['title' => 'Help', 'priority' => 'Low', 'departmentId' => $this->it];
        $this->postJson('/api/v1/tickets', [...$base, 'category' => $shared])->assertCreated();
        $this->postJson('/api/v1/tickets', [...$base, 'category' => $it, 'subcategory' => $sub])->assertCreated();
        $this->postJson('/api/v1/tickets', [...$base, 'category' => $facilities])->assertUnprocessable();
        $this->postJson('/api/v1/tickets', [...$base, 'category' => $shared, 'subcategory' => $sub])->assertUnprocessable();
        $this->postJson('/api/v1/tickets', [...$base, 'subcategory' => $sub])->assertUnprocessable();
        $this->postJson('/api/v1/tickets', [...$base, 'departmentId' => $this->facilities])->assertForbidden();
    }

    public function test_department_admin_cannot_modify_shared_or_other_department_lookups(): void
    {
        $shared = $this->category('Shared');
        $other = $this->category('Facilities only', [$this->facilities]);
        $admin = $this->user('admin', [$this->it]);
        $this->asUser($admin)->postJson('/api/v1/classifications/categories', ['name' => 'IT only', 'department_ids' => [$this->it]])->assertOk();
        $this->postJson('/api/v1/classifications/issue-types', ['name' => 'Shared'])->assertForbidden();
        $this->patchJson('/api/v1/classifications/categories/'.$shared, ['name' => 'Changed'])->assertForbidden();
        $this->patchJson('/api/v1/classifications/categories/'.$other, ['name' => 'Changed'])->assertForbidden();
        $this->asUser($this->owner)->postJson('/api/v1/classifications/issue-types', ['name' => 'Question', 'department_ids' => []])->assertOk();
    }

    public function test_inactive_options_are_not_new_choices_but_existing_tickets_remain_readable(): void
    {
        $category = $this->category('Retired', [$this->it]);
        $ticket = $this->ticket($this->owner, $this->it);
        $ticket->update(['category_id' => $category]);
        DB::table('categories')->where('id', $category)->update(['active' => false]);
        $this->asUser($this->owner)->getJson('/api/v1/tickets')->assertJsonPath('tickets.0.Category', 'Retired');
        $this->postJson('/api/v1/tickets', ['title' => 'Help', 'priority' => 'Low', 'departmentId' => $this->it, 'category' => $category])->assertUnprocessable();
        $this->patchJson('/api/v1/tickets/'.$ticket->id, ['category' => $category, 'priority' => 'High'])->assertNoContent();
    }

    public function test_database_rejects_category_from_another_organization(): void
    {
        $other = Organization::create(['slug' => 'other', 'name' => 'Other', 'status' => 'active', 'allowed_client_ids' => []]);
        $category = DB::table('categories')->insertGetId(['organization_id' => $other->id, 'name' => 'Private']);
        $ticket = $this->ticket($this->owner, $this->it);
        $this->expectException(QueryException::class);
        $ticket->update(['category_id' => $category]);
    }

    public function test_database_rejects_wrong_subcategory_parent(): void
    {
        $one = $this->category('One');
        $two = $this->category('Two');
        $sub = DB::table('subcategories')->insertGetId(['organization_id' => $this->org->id, 'category_id' => $one, 'name' => 'Child']);
        $ticket = $this->ticket($this->owner, $this->it);
        $this->expectException(QueryException::class);
        $ticket->update(['category_id' => $two, 'subcategory_id' => $sub]);
    }
}
