<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\Ticket;
use App\Models\User;
use App\Services\EntraTokenValidator;
use App\Services\OrganizationLifecycle;
use App\Services\TicketWorkflow;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class OrganizationIsolationTest extends TestCase
{
    use RefreshDatabase;

    private Organization $a;

    private Organization $b;

    private User $adminA;

    private User $adminB;

    private Ticket $ticketA;

    private Ticket $ticketB;

    protected function setUp(): void
    {
        parent::setUp();
        config(['helpdesk.deployment_mode' => 'shared']);
        foreach (['a', 'b'] as $key) {
            $org = Organization::create(['slug' => 'hospital-'.$key, 'name' => 'Hospital '.$key, 'entra_tenant_id' => (string) Str::uuid(), 'status' => 'active', 'allowed_client_ids' => [(string) Str::uuid()]]);
            $user = User::create(['organization_id' => $org->id, 'tenant_id' => $org->entra_tenant_id, 'entra_object_id' => (string) Str::uuid(), 'name' => 'Admin '.$key, 'email' => 'admin@example.com', 'role' => 'superAdmin', 'enabled' => true]);
            $ticket = Ticket::create(['organization_id' => $org->id, 'requester_id' => $user->id, 'title' => 'Ticket '.$key, 'description' => 'Private '.$key, 'status' => 'New', 'priority' => 'Low']);
            $this->$key = $org;
            $this->{'admin'.strtoupper($key)} = $user;
            $this->{'ticket'.strtoupper($key)} = $ticket;
        }
        $this->mock(EntraTokenValidator::class)->shouldReceive('validate')->andReturnUsing(fn ($token) => match ($token) {
            'a' => (object) ['tenant_id' => $this->a->entra_tenant_id, 'entra_object_id' => $this->adminA->entra_object_id],
            'b' => (object) ['tenant_id' => $this->b->entra_tenant_id, 'entra_object_id' => $this->adminB->entra_object_id],
        });
    }

    public function test_super_admin_only_sees_own_tickets_users_and_assignees(): void
    {
        $this->withToken('a')->getJson('/api/v1/tickets')->assertOk()->assertJsonCount(1, 'tickets')->assertJsonPath('tickets.0.Id', $this->ticketA->id);
        $this->getJson('/api/v1/tickets?organization_id='.$this->b->id)->assertOk()->assertJsonPath('tickets.0.Id', $this->ticketA->id);
        $this->getJson('/api/v1/users')->assertOk()->assertJsonCount(1)->assertJsonFragment(['id' => $this->adminA->id]);
        $this->getJson('/api/v1/assignees')->assertOk()->assertJsonCount(1)->assertJsonFragment(['id' => $this->adminA->id]);
        $this->getJson('/api/v1/session')->assertOk()->assertJsonPath('organization.id', $this->a->id)->assertJsonPath('title', $this->a->name);
        $this->withToken('b')->getJson('/api/v1/tickets')->assertOk()->assertJsonCount(1, 'tickets')->assertJsonPath('tickets.0.Id', $this->ticketB->id);
        $this->assertFalse(Gate::forUser($this->adminA)->allows('view', $this->ticketB));
        $this->assertFalse(Gate::forUser($this->adminA)->allows('update', $this->ticketB));
    }

    public function test_direct_foreign_ticket_routes_do_not_leak_or_mutate_data(): void
    {
        $this->withToken('a');
        $id = $this->ticketB->id;
        $this->getJson("/api/v1/tickets/{$id}/comments")->assertNotFound();
        $this->getJson("/api/v1/tickets/{$id}/history")->assertNotFound();
        $this->postJson("/api/v1/tickets/{$id}/comments", ['text' => 'Injected'])->assertNotFound();
        $this->postJson("/api/v1/tickets/{$id}/response")->assertNotFound();
        $this->patchJson("/api/v1/tickets/{$id}", ['priority' => 'Critical'])->assertNotFound();
        $this->assertSame('Low', $this->ticketB->fresh()->priority);
        $this->assertDatabaseCount('ticket_comments', 0);
        $this->assertDatabaseCount('audit_events', 0);
    }

    public function test_request_cannot_choose_organization_or_assign_a_foreign_user(): void
    {
        $this->withToken('a');
        $input = ['title' => 'Test', 'description' => 'Test', 'priority' => 'Low'];
        $this->postJson('/api/v1/tickets', [...$input, 'organization_id' => $this->b->id])->assertUnprocessable();
        $this->postJson('/api/v1/tickets', [...$input, 'assignedToId' => $this->adminB->id])->assertUnprocessable();
        $this->patchJson('/api/v1/tickets/'.$this->ticketA->id, ['assignedToId' => $this->adminB->id])->assertUnprocessable();
        $this->postJson('/api/v1/tickets', [...$input, 'assignedToId' => $this->adminA->id])->assertCreated();
        $this->assertDatabaseHas('tickets', ['title' => 'Test', 'organization_id' => $this->a->id]);
        $this->postJson('/api/v1/users', ['organization_id' => $this->b->id, 'entra_object_id' => $this->adminB->entra_object_id])->assertUnprocessable();
        $this->assertDatabaseHas('users', ['id' => $this->adminB->id, 'organization_id' => $this->b->id, 'role' => 'superAdmin']);
    }

    public function test_comments_and_audit_writes_carry_the_authenticated_organization(): void
    {
        $this->withToken('a')->postJson('/api/v1/tickets/'.$this->ticketA->id.'/comments', ['text' => 'Own comment'])->assertNoContent();
        $this->assertDatabaseHas('ticket_comments', ['organization_id' => $this->a->id, 'user_id' => $this->adminA->id]);
        $this->assertDatabaseHas('audit_events', ['organization_id' => $this->a->id, 'user_id' => $this->adminA->id]);
        $this->getJson('/api/v1/tickets/'.$this->ticketA->id.'/comments')->assertOk()->assertJsonCount(1);
        $this->withToken('b')->getJson('/api/v1/tickets/'.$this->ticketB->id.'/comments')->assertOk()->assertJsonCount(0);
    }

    public function test_suspension_expiry_and_cancellation_block_existing_tokens_without_deleting_data(): void
    {
        $this->withToken('a')->getJson('/api/v1/session')->assertOk();
        $lifecycle = app(OrganizationLifecycle::class);
        foreach (['suspended', 'cancelled'] as $status) {
            $lifecycle->update($this->a->slug, ['status' => $status], 'owner@example.com', 'Access decision');
            $this->withToken('a')->getJson('/api/v1/session')->assertForbidden();
            $this->postJson('/api/v1/tickets', ['title' => 'Blocked', 'description' => 'Blocked', 'priority' => 'Low'])->assertForbidden();
            $this->withToken('b')->getJson('/api/v1/session')->assertOk();
        }
        $lifecycle->update($this->a->slug, ['status' => 'active', 'access_expires_at' => now()->subSecond()], 'owner@example.com', 'Expired');
        $this->withToken('a')->getJson('/api/v1/tickets')->assertForbidden();
        $lifecycle->update($this->a->slug, ['access_expires_at' => null], 'owner@example.com', 'Renewed');
        $this->getJson('/api/v1/tickets')->assertOk();
        $this->assertDatabaseCount('tickets', 2);
        $this->assertDatabaseCount('users', 2);
        $this->assertDatabaseCount('organization_events', 4);
    }

    public function test_dedicated_deployment_pins_one_organization_and_bad_configuration_denies_access(): void
    {
        config(['helpdesk.deployment_mode' => 'dedicated', 'helpdesk.organization_slug' => $this->a->slug]);
        $this->withToken('a')->getJson('/api/v1/session')->assertOk();
        $this->withToken('b')->getJson('/api/v1/session')->assertForbidden();
        config(['helpdesk.organization_slug' => null]);
        $this->withToken('a')->getJson('/api/v1/session')->assertForbidden();
        config(['helpdesk.deployment_mode' => 'typo']);
        $this->getJson('/api/v1/session')->assertForbidden();
    }

    public function test_customer_admin_cannot_manage_organization_access(): void
    {
        $this->withToken('a')->patchJson('/api/v1/organizations/'.$this->a->id, ['status' => 'active'])->assertNotFound();
        $this->assertSame('active', $this->a->fresh()->status);
    }

    public function test_database_rejects_cross_organization_assignment_even_without_http_validation(): void
    {
        $this->expectException(QueryException::class);
        DB::table('tickets')->where('id', $this->ticketA->id)->update(['assigned_to_id' => $this->adminB->id]);
    }

    public function test_database_rejects_foreign_comment_authorship(): void
    {
        $this->expectException(QueryException::class);
        DB::table('ticket_comments')->insert(['organization_id' => $this->a->id, 'ticket_id' => $this->ticketA->id, 'user_id' => $this->adminB->id, 'text' => 'Invalid']);
    }

    public function test_database_rejects_foreign_audit_ticket(): void
    {
        $this->expectException(QueryException::class);
        DB::table('audit_events')->insert(['organization_id' => $this->a->id, 'ticket_id' => $this->ticketB->id, 'user_id' => $this->adminA->id, 'action' => 'invalid', 'changes' => '{}']);
    }

    public function test_background_workflow_cannot_create_tickets_for_suspended_organization(): void
    {
        $this->a->update(['status' => 'suspended']);
        $this->expectException(HttpException::class);
        app(TicketWorkflow::class)->create($this->adminA, ['title' => 'Blocked', 'description' => 'Blocked', 'priority' => 'Low']);
    }

    public function test_workflow_rejects_foreign_assignee_without_http_validation(): void
    {
        $this->expectException(HttpException::class);
        app(TicketWorkflow::class)->create($this->adminA, ['title' => 'Blocked', 'description' => 'Blocked', 'priority' => 'Low', 'assignedToId' => $this->adminB->id]);
    }
}
