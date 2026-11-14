<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\Ticket;
use App\Models\User;
use App\Services\EntraTokenValidator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class AuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private string $tenant = '11111111-1111-4111-8111-111111111111';

    private function user(string $role): User
    {
        $organization = Organization::firstOrCreate(['entra_tenant_id' => $this->tenant], ['slug' => 'test-hospital', 'name' => 'Test Hospital', 'status' => 'active', 'allowed_client_ids' => ['spfx-client']]);

        $user = User::create(['organization_id' => $organization->id, 'tenant_id' => $this->tenant, 'entra_object_id' => (string) Str::uuid(), 'name' => $role, 'email' => $role.'@example.com', 'role' => $role, 'enabled' => true]);
        $department = DB::table('departments')->where('organization_id', $organization->id)->value('id') ?? DB::table('departments')->insertGetId(['organization_id' => $organization->id, 'name' => 'IT']);
        DB::table('department_memberships')->insert(['organization_id' => $organization->id, 'department_id' => $department, 'user_id' => $user->id]);

        return $user;
    }

    private function tokenFor(User $user): static
    {
        config(['helpdesk.deployment_mode' => 'shared']);
        $this->mock(EntraTokenValidator::class)->shouldReceive('validate')->with('test-token')->andReturn((object) ['tenant_id' => $this->tenant, 'entra_object_id' => $user->entra_object_id]);

        return $this->withToken('test-token');
    }

    private function ticket(User $requester, ?User $assignee = null): Ticket
    {
        return Ticket::create(['organization_id' => $requester->organization_id, 'department_id' => DB::table('departments')->where('organization_id', $requester->organization_id)->value('id'), 'created_by_id' => $requester->id, 'requester_id' => $requester->id, 'assigned_to_id' => $assignee?->id, 'title' => 'Printer issue', 'description' => 'Offline', 'priority' => 'Medium', 'status' => 'New']);
    }

    public function test_authentication_and_disabled_users_fail_closed(): void
    {
        $this->getJson('/api/v1/session')->assertUnauthorized();
        $user = $this->user('requester');
        $this->tokenFor($user)->getJson('/api/v1/session')->assertOk();
        $user->update(['enabled' => false]);
        $this->getJson('/api/v1/session')->assertForbidden();
    }

    public function test_ticket_description_is_optional_and_can_be_cleared(): void
    {
        $admin = $this->user('superAdmin');
        $this->tokenFor($admin);
        foreach ([[], ['description' => ''], ['description' => null]] as $optionalDescription) {
            $this->postJson('/api/v1/tickets', array_merge(['title' => 'No details', 'priority' => 'Low'], $optionalDescription))->assertCreated();
        }
        $this->assertSame(3, Ticket::whereNull('description')->count());
        $this->getJson('/api/v1/tickets')->assertOk()->assertJsonPath('tickets.0.Description', '');

        $ticket = $this->ticket($admin);
        $this->patchJson("/api/v1/tickets/{$ticket->id}", ['title' => 'Updated'])->assertNoContent();
        $this->assertSame('Offline', $ticket->fresh()->description);
        $this->patchJson("/api/v1/tickets/{$ticket->id}", ['description' => ''])->assertNoContent();
        $this->assertNull($ticket->fresh()->description);
    }

    public function test_requester_cannot_read_or_comment_on_someone_elses_ticket(): void
    {
        $user = $this->user('requester');
        $own = $this->ticket($user);
        $other = $this->ticket($this->user('agent'));
        $this->tokenFor($user)->getJson('/api/v1/tickets')->assertOk()->assertJsonCount(1, 'tickets')->assertJsonPath('tickets.0.Id', $own->id);
        $this->getJson("/api/v1/tickets/{$other->id}/comments")->assertForbidden();
        $this->getJson("/api/v1/tickets/{$other->id}/history")->assertForbidden();
        $this->postJson("/api/v1/tickets/{$other->id}/comments", ['text' => 'forged'])->assertForbidden();
        $this->postJson("/api/v1/tickets/{$own->id}/comments", ['text' => 'more details'])->assertNoContent();
        $this->patchJson("/api/v1/tickets/{$own->id}", ['status' => 'Closed'])->assertForbidden();
    }

    public function test_requester_identity_cannot_be_spoofed_or_promoted(): void
    {
        $requester = $this->user('requester');
        $agent = $this->user('agent');
        $this->tokenFor($requester)->postJson('/api/v1/tickets', ['title' => 'Test', 'description' => 'Test', 'priority' => 'Low', 'requesterEmail' => 'other@example.com'])->assertUnprocessable();
        $this->postJson('/api/v1/tickets', ['title' => 'Test', 'description' => 'Test', 'priority' => 'Low', 'assignedToId' => $agent->id])->assertForbidden();
        $this->postJson('/api/v1/tickets', ['title' => 'Test', 'description' => 'Test', 'priority' => 'Low', 'role' => 'superAdmin'])->assertCreated();
        $this->assertDatabaseHas('tickets', ['requester_id' => $requester->id]);
        $this->postJson('/api/v1/users', ['entra_object_id' => $requester->entra_object_id, 'role' => 'superAdmin'])->assertForbidden();
    }

    public function test_agent_only_manages_assigned_tickets_and_admin_owns_sensitive_transitions(): void
    {
        $agent = $this->user('agent');
        $requester = $this->user('requester');
        $ticket = $this->ticket($requester, $agent);
        $other = $this->ticket($requester);
        $this->tokenFor($agent)->patchJson("/api/v1/tickets/{$other->id}", ['status' => 'Resolved'])->assertForbidden();
        $this->patchJson("/api/v1/tickets/{$ticket->id}", ['priority' => 'Critical'])->assertForbidden();
        $this->patchJson("/api/v1/tickets/{$ticket->id}", ['assignedToId' => null])->assertForbidden();
        $this->patchJson("/api/v1/tickets/{$ticket->id}", ['archived' => true])->assertForbidden();
        $this->patchJson("/api/v1/tickets/{$ticket->id}", ['status' => 'Closed'])->assertForbidden();
        $this->patchJson("/api/v1/tickets/{$ticket->id}", ['status' => 'Resolved', 'resolutionSummary' => 'Fixed'])->assertNoContent();
        $this->assertNotNull($ticket->fresh()->resolved_at);
        $this->patchJson("/api/v1/tickets/{$ticket->id}", ['status' => 'New'])->assertForbidden();
        $admin = $this->user('admin');
        $this->tokenFor($admin)->patchJson("/api/v1/tickets/{$ticket->id}", ['status' => 'New'])->assertNoContent();
        $this->assertNull($ticket->fresh()->resolved_at);
        $this->assertDatabaseHas('audit_events', ['ticket_id' => $ticket->id, 'action' => 'ticket.updated', 'user_id' => $admin->id]);
    }

    public function test_role_changes_apply_to_existing_tokens(): void
    {
        $user = $this->user('admin');
        $ticket = $this->ticket($this->user('requester'));
        $this->tokenFor($user)->patchJson("/api/v1/tickets/{$ticket->id}", ['priority' => 'High'])->assertNoContent();
        $user->update(['role' => 'requester']);
        $this->patchJson("/api/v1/tickets/{$ticket->id}", ['priority' => 'Low'])->assertForbidden();
    }

    public function test_user_administration_requires_super_admin_and_prevents_self_lockout(): void
    {
        $admin = $this->user('admin');
        $this->tokenFor($admin)->getJson('/api/v1/users')->assertForbidden();
        $super = $this->user('superAdmin');
        $this->tokenFor($super)->getJson('/api/v1/users')->assertOk()->assertJsonFragment(['entra_object_id' => $admin->entra_object_id]);
        $this->tokenFor($super)->postJson('/api/v1/users', ['entra_object_id' => $super->entra_object_id, 'name' => $super->name, 'email' => $super->email, 'role' => 'requester', 'enabled' => false])->assertUnprocessable();
        $this->postJson('/api/v1/users', ['entra_object_id' => $admin->entra_object_id, 'name' => $admin->name, 'email' => $admin->email, 'role' => 'agent', 'enabled' => false])->assertNoContent();
        $this->assertDatabaseHas('users', ['id' => $admin->id, 'role' => 'agent', 'enabled' => false]);
        $this->assertDatabaseHas('audit_events', ['action' => 'user.saved', 'user_id' => $super->id]);
        $this->postJson('/api/v1/users', ['entra_object_id' => (string) Str::uuid(), 'name' => 'Different identity', 'email' => $admin->email, 'role' => 'admin', 'enabled' => true])->assertUnprocessable();
        $this->assertDatabaseHas('users', ['id' => $admin->id, 'entra_object_id' => $admin->entra_object_id, 'role' => 'agent']);
    }

    public function test_pagination_is_scoped_and_first_response_is_idempotent(): void
    {
        $user = $this->user('admin');
        $ticket = $this->ticket($user);
        $this->tokenFor($user)->getJson('/api/v1/tickets?after='.$ticket->id)->assertOk()->assertJsonCount(0, 'tickets')->assertJsonPath('next', null);
        $this->postJson("/api/v1/tickets/{$ticket->id}/response")->assertNoContent();
        $this->postJson("/api/v1/tickets/{$ticket->id}/response")->assertNoContent();
        $this->assertDatabaseCount('audit_events', 1);
    }
}
