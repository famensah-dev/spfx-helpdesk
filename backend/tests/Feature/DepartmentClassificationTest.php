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

    public function test_entra_groups_do_not_grant_application_department_membership(): void
    {
        $group = (string) Str::uuid();
        DB::table('department_entra_groups')->insert(['organization_id' => $this->org->id, 'department_id' => $this->it, 'entra_group_id' => $group]);
        $user = $this->user('requester');
        $this->ticket($user, $this->it);
        $this->ticket($this->owner, $this->it);
        $this->ticket($user, $this->facilities);
        $this->asUser($user)->getJson('/api/v1/tickets')->assertJsonCount(0, 'tickets');
        $this->mock(EntraTokenValidator::class)->shouldReceive('validate')->andReturn((object) ['tenant_id' => $user->tenant_id, 'entra_object_id' => $user->entra_object_id, 'entra_group_ids' => [$group]]);
        $this->getJson('/api/v1/tickets')->assertJsonCount(0, 'tickets');
        $this->getJson('/api/v1/session')->assertJsonPath('access.role', 'requester');
        DB::table('department_memberships')->insert(['organization_id' => $this->org->id, 'department_id' => $this->it, 'user_id' => $user->id]);
        DB::table('department_entra_groups')->delete();
        $this->getJson('/api/v1/tickets')->assertJsonCount(1, 'tickets');
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

    public function test_assignee_requires_application_membership_even_with_verified_groups(): void
    {
        $group = (string) Str::uuid();
        $agent = $this->user('agent');
        DB::table('department_entra_groups')->insert(['organization_id' => $this->org->id, 'department_id' => $this->it, 'entra_group_id' => $group]);
        DB::table('user_entra_group_cache')->insert(['organization_id' => $this->org->id, 'user_id' => $agent->id, 'entra_group_id' => $group, 'expires_at' => now()->addMinutes(5)]);
        $base = ['title' => 'Assigned', 'priority' => 'Low', 'departmentId' => $this->it, 'assignedToId' => $agent->id];
        $this->asUser($this->owner)->postJson('/api/v1/tickets', $base)->assertUnprocessable();
        DB::table('department_memberships')->insert(['organization_id' => $this->org->id, 'department_id' => $this->it, 'user_id' => $agent->id]);
        $this->postJson('/api/v1/tickets', $base)->assertCreated();
        $this->postJson('/api/v1/tickets', [...$base, 'departmentId' => $this->facilities])->assertUnprocessable();
        DB::table('user_entra_group_cache')->where('user_id', $agent->id)->update(['expires_at' => now()->subSecond()]);
        $this->postJson('/api/v1/tickets', $base)->assertCreated();
        DB::table('department_memberships')->where('user_id', $agent->id)->delete();
        $this->postJson('/api/v1/tickets', $base)->assertUnprocessable();
    }

    public function test_admin_manages_department_users_but_cannot_change_unmanaged_staff_or_super_admins(): void
    {
        $admin = $this->user('admin', [$this->it]);
        $staff = $this->user('agent', [$this->it]);
        $payload = fn ($role, $disabled = false) => ['assignments' => [
            ['userId' => $admin->id, 'roleId' => 'admin'],
            ['userId' => $staff->id, 'roleId' => $role, 'disabled' => $disabled],
        ]];
        $this->asUser($admin)->getJson('/api/v1/departments/'.$this->it)->assertJsonPath('can_manage_users', true);
        $this->putJson('/api/v1/departments/'.$this->it.'/assignments', $payload('requester', true))->assertNoContent();
        $this->assertDatabaseHas('users', ['id' => $staff->id, 'role' => 'requester', 'enabled' => false]);
        $this->putJson('/api/v1/departments/'.$this->it.'/assignments', $payload('admin'))->assertNoContent();
        DB::table('department_memberships')->insert(['organization_id' => $this->org->id, 'department_id' => $this->facilities, 'user_id' => $staff->id]);
        $this->putJson('/api/v1/departments/'.$this->it.'/assignments', $payload('agent'))->assertForbidden();
        $this->putJson('/api/v1/departments/'.$this->it.'/assignments', ['assignments' => [['userId' => $this->owner->id, 'roleId' => 'admin']]])->assertUnprocessable();
        $this->putJson('/api/v1/departments/'.$this->facilities.'/assignments', $payload('agent'))->assertNotFound();
        $rules = ['agent' => ['name' => 'Agent', 'scope' => 'assigned', 'actions' => []], 'admin' => ['name' => 'Administrator', 'scope' => 'all', 'actions' => ['tickets'], 'pageAccess' => ['settings', 'roles']]];
        $this->asUser($this->owner)->patchJson('/api/v1/departments/'.$this->it, ['roles' => $rules])->assertNoContent();
        $this->asUser($admin)->getJson('/api/v1/departments/'.$this->it)->assertJsonPath('can_manage_users', false);
        $this->putJson('/api/v1/departments/'.$this->it.'/assignments', $payload('agent'))->assertForbidden();
        $rules['admin']['actions'][] = 'manageUsers';
        $this->patchJson('/api/v1/departments/'.$this->it, ['roles' => $rules])->assertForbidden();
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

    public function test_original_users_page_can_save_assignments_without_cross_department_removal(): void
    {
        $user = $this->user('requester', [$this->facilities]);
        $body = ['assignments' => [['userId' => $user->id, 'roleId' => 'agent', 'disabled' => false]]];
        $this->asUser($this->owner)->putJson('/api/v1/departments/'.$this->it.'/assignments', $body)->assertNoContent();
        $this->putJson('/api/v1/departments/'.$this->it.'/assignments', $body)->assertNoContent();
        $this->assertDatabaseHas('users', ['id' => $user->id, 'role' => 'agent', 'enabled' => true]);
        $this->assertDatabaseHas('department_memberships', ['department_id' => $this->it, 'user_id' => $user->id]);
        $this->putJson('/api/v1/departments/'.$this->it.'/assignments', ['assignments' => []])->assertNoContent();
        $this->assertDatabaseMissing('department_memberships', ['department_id' => $this->it, 'user_id' => $user->id]);
        $this->assertDatabaseHas('department_memberships', ['department_id' => $this->facilities, 'user_id' => $user->id]);
        $admin = $this->user('admin', [$this->it]);
        $this->asUser($admin)->putJson('/api/v1/departments/'.$this->it.'/assignments', $body)->assertForbidden();
        $this->asUser($this->owner)->putJson('/api/v1/departments/'.$this->it.'/assignments', ['assignments' => [['userId' => $this->owner->id, 'roleId' => 'agent']]])->assertUnprocessable();
    }

    public function test_directory_resolution_requires_owner_and_does_not_grant_access(): void
    {
        $input = ['entra_object_id' => (string) Str::uuid(), 'name' => 'Directory User', 'email' => 'directory@example.com'];
        $admin = $this->user('admin', [$this->it]);
        $this->asUser($admin)->postJson('/api/v1/directory-users/resolve', $input)->assertForbidden();
        $this->asUser($this->owner)->postJson('/api/v1/directory-users/resolve', $input)->assertCreated();
        $this->assertDatabaseHas('users', ['organization_id' => $this->org->id, 'entra_object_id' => $input['entra_object_id'], 'enabled' => false, 'role' => 'requester']);
        $this->postJson('/api/v1/directory-users/resolve', $input)->assertOk();
    }

    public function test_workspace_general_settings_are_owner_only_and_persist_in_database(): void
    {
        $body = ['title' => 'Hospital Support', 'description' => 'Staff helpdesk'];
        $this->asUser($this->user('admin', [$this->it]))->putJson('/api/v1/workspace-settings', $body)->assertForbidden();
        $this->asUser($this->owner)->putJson('/api/v1/workspace-settings', $body)->assertNoContent();
        $this->getJson('/api/v1/session')->assertJsonPath('workspace.title', 'Hospital Support')->assertJsonPath('workspace.description', 'Staff helpdesk');
    }

    public function test_existing_schema_page_reads_real_nullable_metadata_without_edit_access(): void
    {
        $this->asUser($this->user('admin', [$this->it]))->getJson('/api/v1/ticket-schema')->assertForbidden();
        $response = $this->asUser($this->owner)->getJson('/api/v1/ticket-schema')->assertOk()->assertJsonPath('canCreateColumns', false);
        $description = collect($response->json('columns'))->firstWhere('name', 'description');
        $this->assertFalse($description['required']);
        $this->assertFalse($description['canEdit']);
        $this->assertFalse($description['canDelete']);
    }

    public function test_existing_role_page_settings_are_enforced_by_api_and_parent_options_remain_available(): void
    {
        $category = $this->category('Computers', [$this->it]);
        $admin = $this->user('admin', [$this->it]);
        DB::table('departments')->where('id', $this->it)->update(['role_settings' => json_encode(['admin' => ['name' => 'Admin', 'scope' => 'all', 'actions' => DepartmentAccess::ACTIONS, 'pageAccess' => ['settings', 'subcategories']]])]);
        $this->asUser($admin)->getJson('/api/v1/classifications/categories')->assertForbidden();
        $this->getJson('/api/v1/departments/'.$this->it)->assertForbidden();
        $this->getJson('/api/v1/classifications/categories?parentsFor=subcategories')->assertOk()->assertJsonCount(1);
        $this->postJson('/api/v1/classifications/subcategories', ['name' => 'Printer', 'category_id' => $category])->assertOk();
        $this->getJson('/api/v1/session')->assertJsonPath('roleRules.pageAccess', ['settings', 'subcategories']);
    }

    public function test_original_ticket_fields_and_assigned_creation_status_are_preserved(): void
    {
        $agent = $this->user('agent', [$this->it]);
        $this->asUser($this->owner)->postJson('/api/v1/tickets', ['title' => 'Printer', 'priority' => 'Low', 'departmentId' => $this->it, 'assignedToId' => $agent->id, 'ticketSource' => 'Phone / Call-in', 'ticketType' => 'Incident', 'dueDate' => '2026-12-01T12:00:00Z'])->assertCreated();
        $ticket = Ticket::latest('id')->first();
        $this->assertSame('In Progress', $ticket->status);
        $this->assertSame('Incident', $ticket->ticket_type);
        $this->assertNotNull($ticket->due_date);
        $this->patchJson('/api/v1/tickets/'.$ticket->id, ['ticketSource' => 'Other'])->assertUnprocessable();
        $this->patchJson('/api/v1/tickets/'.$ticket->id, ['ticketSource' => null])->assertUnprocessable();
    }

    public function test_agent_can_resolve_submitted_ticket_without_gaining_assignee_management(): void
    {
        $creator = $this->user('agent', [$this->it]);
        $handler = $this->user('agent', [$this->it]);
        $ticket = $this->ticket($creator, $this->it, $handler);
        $this->asUser($creator)->patchJson('/api/v1/tickets/'.$ticket->id, ['status' => 'Resolved', 'resolutionSummary' => 'Confirmed working'])->assertNoContent();
        $this->patchJson('/api/v1/tickets/'.$ticket->id, ['priority' => 'Critical'])->assertForbidden();
        $this->postJson('/api/v1/tickets/'.$ticket->id.'/response')->assertForbidden();
        $this->patchJson('/api/v1/tickets/'.$ticket->id, ['status' => 'Closed'])->assertForbidden();
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
