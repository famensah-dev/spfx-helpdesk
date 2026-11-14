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

class KnowledgeBaseTest extends TestCase
{
    use RefreshDatabase;

    private Organization $org;
    private int $it;
    private int $facilities;

    protected function setUp(): void
    {
        parent::setUp();
        config(['helpdesk.deployment_mode' => 'shared']);
        $this->org = Organization::create(['slug' => 'hospital', 'name' => 'Hospital', 'entra_tenant_id' => (string) Str::uuid(), 'allowed_client_ids' => [], 'status' => 'active']);
        $this->it = DB::table('departments')->insertGetId(['organization_id' => $this->org->id, 'name' => 'IT']);
        $this->facilities = DB::table('departments')->insertGetId(['organization_id' => $this->org->id, 'name' => 'Facilities']);
    }

    private function user(string $role, ?int $department = null): User
    {
        $user = User::create(['organization_id' => $this->org->id, 'tenant_id' => $this->org->entra_tenant_id, 'entra_object_id' => (string) Str::uuid(), 'name' => $role, 'email' => Str::uuid().'@example.com', 'role' => $role, 'enabled' => true]);
        DB::table('department_memberships')->insert(['organization_id' => $this->org->id, 'department_id' => $department ?? $this->it, 'user_id' => $user->id]);

        return $user;
    }

    private function asUser(User $user): static
    {
        $this->mock(EntraTokenValidator::class)->shouldReceive('validate')->andReturn((object) ['tenant_id' => $user->tenant_id, 'entra_object_id' => $user->entra_object_id]);

        return $this->withToken('test-token');
    }

    private function input(array $changes = []): array
    {
        return [...['department_id' => $this->it, 'question' => 'Reset a printer', 'answer' => '<p>Restart the printer.</p>', 'keywords' => 'printer', 'published' => true, 'sortOrder' => 1], ...$changes];
    }

    private function ticket(User $user): Ticket
    {
        return Ticket::create(['organization_id' => $this->org->id, 'department_id' => $this->it, 'created_by_id' => $user->id, 'requester_id' => $user->id, 'title' => 'Printer issue', 'description' => null, 'priority' => 'Low', 'status' => 'New']);
    }

    public function test_articles_restore_session_navigation_and_are_department_scoped_and_sanitized(): void
    {
        $owner = $this->user('superAdmin');
        $staff = $this->user('requester');
        $outside = $this->user('requester', $this->facilities);
        $this->asUser($owner)->postJson('/api/v1/knowledge-articles', $this->input(['answer' => '<p onclick="alert(1)">Safe <strong>answer</strong></p><script>alert(1)</script><a href="javascript:alert(1)">link</a>']))->assertCreated();
        $this->asUser($staff)->getJson('/api/v1/session')->assertOk()->assertJsonFragment(['faqs']);
        $articles = $this->getJson('/api/v1/knowledge-articles')->assertOk()->assertJsonCount(1)->json();
        $this->assertStringContainsString('<strong>answer</strong>', $articles[0]['answer']);
        $this->assertStringNotContainsString('onclick', $articles[0]['answer']);
        $this->assertStringNotContainsString('script', $articles[0]['answer']);
        $this->asUser($outside)->getJson('/api/v1/knowledge-articles')->assertOk()->assertJsonCount(0);
        $this->patchJson('/api/v1/knowledge-articles/'.$articles[0]['id'], $this->input())->assertNotFound();
    }

    public function test_requesters_submit_ticket_drafts_but_cannot_publish_or_manage_articles(): void
    {
        $staff = $this->user('requester');
        $ticket = $this->ticket($staff);
        $this->asUser($staff)->postJson('/api/v1/knowledge-articles', $this->input())->assertForbidden();
        $this->postJson('/api/v1/knowledge-articles', $this->input(['published' => false, 'sourceTicketId' => $ticket->id]))->assertCreated();
        $this->getJson('/api/v1/knowledge-articles')->assertOk()->assertJsonCount(0);
        $this->getJson('/api/v1/knowledge-articles?manage=1&department_id='.$this->it)->assertForbidden();
        $owner = $this->user('superAdmin');
        $this->asUser($owner)->getJson('/api/v1/knowledge-articles?manage=1&department_id='.$this->it)->assertOk()->assertJsonCount(1);
    }

    public function test_agents_edit_only_owned_or_explicitly_shared_articles_and_only_managers_delete(): void
    {
        $agent = $this->user('agent');
        $other = $this->user('agent');
        $id = $this->asUser($agent)->postJson('/api/v1/knowledge-articles', $this->input())->assertCreated()->json('id');
        $this->asUser($other)->patchJson('/api/v1/knowledge-articles/'.$id, $this->input())->assertForbidden();
        $this->deleteJson('/api/v1/knowledge-articles/'.$id)->assertForbidden();
        $owner = $this->user('superAdmin');
        $this->asUser($owner)->patchJson('/api/v1/knowledge-articles/'.$id, $this->input(['agentEditingEnabled' => true]))->assertOk();
        $this->asUser($other)->patchJson('/api/v1/knowledge-articles/'.$id, $this->input(['agentEditingEnabled' => true, 'question' => 'Updated help']))->assertOk();
        $this->asUser($owner)->deleteJson('/api/v1/knowledge-articles/'.$id)->assertNoContent();
        $this->assertDatabaseCount('knowledge_articles', 0);
    }

    public function test_cross_organization_classifications_and_wrong_subcategory_parents_are_rejected(): void
    {
        $owner = $this->user('superAdmin');
        $a = DB::table('categories')->insertGetId(['organization_id' => $this->org->id, 'name' => 'A']);
        $b = DB::table('categories')->insertGetId(['organization_id' => $this->org->id, 'name' => 'B']);
        $sub = DB::table('subcategories')->insertGetId(['organization_id' => $this->org->id, 'category_id' => $a, 'name' => 'Child']);
        $this->asUser($owner)->postJson('/api/v1/knowledge-articles', $this->input(['categoryId' => $b, 'subcategoryId' => $sub]))->assertUnprocessable();
        $this->postJson('/api/v1/knowledge-articles', $this->input(['categoryId' => 99999]))->assertUnprocessable();
        $this->postJson('/api/v1/knowledge-articles', $this->input(['categoryId' => $a, 'subcategoryId' => $sub]))->assertCreated();
    }

    public function test_comment_deletion_is_author_only_scoped_and_expires_at_ten_minutes(): void
    {
        $this->freezeTime();
        $staff = $this->user('requester');
        $owner = $this->user('superAdmin');
        $ticket = $this->ticket($staff);
        $id = DB::table('ticket_comments')->insertGetId(['organization_id' => $this->org->id, 'ticket_id' => $ticket->id, 'user_id' => $staff->id, 'text' => 'My comment', 'created_at' => now(), 'updated_at' => now()]);
        $this->asUser($staff)->getJson('/api/v1/tickets/'.$ticket->id.'/comments')->assertOk()->assertJsonPath('0.canDelete', true);
        $this->asUser($owner)->deleteJson('/api/v1/tickets/'.$ticket->id.'/comments/'.$id)->assertForbidden();
        $this->travel(10)->minutes();
        $this->asUser($staff)->deleteJson('/api/v1/tickets/'.$ticket->id.'/comments/'.$id)->assertForbidden();
        DB::table('ticket_comments')->where('id', $id)->update(['created_at' => now()->subMinutes(9)]);
        $this->deleteJson('/api/v1/tickets/'.$ticket->id.'/comments/'.$id)->assertNoContent();
        $this->assertDatabaseHas('audit_events', ['action' => 'comment.deleted', 'ticket_id' => $ticket->id]);
    }
}
