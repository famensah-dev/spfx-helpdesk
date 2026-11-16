<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Services\EntraTokenValidator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class DepartmentSettingsTest extends TestCase
{
    use RefreshDatabase;

    private Organization $org;

    private int $department;

    private int $other;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        config(['helpdesk.deployment_mode' => 'shared']);
        $this->org = Organization::create(['slug' => 'hospital', 'name' => 'Hospital', 'entra_tenant_id' => (string) Str::uuid(), 'allowed_client_ids' => [], 'status' => 'active']);
        $this->department = DB::table('departments')->insertGetId(['organization_id' => $this->org->id, 'name' => 'IT']);
        $this->other = DB::table('departments')->insertGetId(['organization_id' => $this->org->id, 'name' => 'Facilities']);
        $this->admin = $this->user('admin');
    }

    private function user(string $role, ?int $department = null): User
    {
        $user = User::create(['organization_id' => $this->org->id, 'tenant_id' => $this->org->entra_tenant_id, 'entra_object_id' => (string) Str::uuid(), 'email' => Str::uuid().'@example.com', 'name' => $role, 'role' => $role, 'enabled' => true]);
        DB::table('department_memberships')->insert(['organization_id' => $this->org->id, 'department_id' => $department ?? $this->department, 'user_id' => $user->id]);

        return $user;
    }

    private function asUser(User $user): static
    {
        $this->mock(EntraTokenValidator::class)->shouldReceive('validate')->andReturn((object) ['tenant_id' => $user->tenant_id, 'entra_object_id' => $user->entra_object_id]);

        return $this->withToken('test-token');
    }

    private function path(string $suffix): string
    {
        return '/api/v1/departments/'.$this->department.'/'.$suffix;
    }

    public function test_sla_targets_and_clock_rules_round_trip_with_validation(): void
    {
        $settings = $this->asUser($this->admin)->getJson($this->path('configuration/sla'))->assertOk()->assertJsonPath('settingsOnly', true)->json();
        $priority = ['name' => 'Urgent', 'active' => true, 'responseMinutes' => 20, 'resolutionMinutes' => 120];
        $this->postJson($this->path('sla/priorities'), $priority)->assertNoContent();
        $clock = [...$settings['clockRules'], 'businessHoursOnly' => true, 'timeZone' => 'Africa/Accra'];
        $this->putJson($this->path('sla/clock'), $clock)->assertNoContent();
        $result = $this->getJson($this->path('configuration/sla'))->assertOk()->assertJsonCount(5, 'priorities')->assertJsonPath('clockRules.timeZone', 'Africa/Accra')->json();
        $this->assertSame('Urgent', $result['priorities'][4]['name']);
        $this->putJson($this->path('sla/clock'), [...$clock, 'timeZone' => 'Not/AZone'])->assertUnprocessable();
        $this->putJson($this->path('sla/clock'), [...$clock, 'endMinute' => 1])->assertUnprocessable();
        $this->postJson($this->path('sla/priorities'), [...$priority, 'responseMinutes' => -1])->assertUnprocessable();
        $this->postJson($this->path('sla/priorities'), [...$priority, 'id' => 'High'])->assertUnprocessable();
    }

    public function test_email_templates_are_validated_sanitized_and_department_scoped(): void
    {
        $rules = [];
        foreach (['created', 'assigned', 'resolved', 'closed', 'invited', 'slaBreached'] as $event) {
            $rules[$event] = ['email' => true, 'inApp' => false, 'subject' => 'Ticket {{TicketId}}', 'body' => '<p onclick="bad()">{{TicketTitle}}</p><script>bad()</script>', 'to' => ['requester'], 'cc' => [], 'extraTo' => [], 'extraCc' => []];
        }
        $input = ['enabled' => false, 'autoInvite' => false, 'sender' => 'current', 'sharedMailbox' => '', 'replyTo' => '', 'appUrl' => 'https://hospital.sharepoint.com/sites/desk', 'rules' => $rules];
        $this->asUser($this->admin)->putJson($this->path('configuration/email'), $input)->assertNoContent();
        $result = $this->getJson($this->path('configuration/email'))->assertOk()->json();
        $this->assertSame('<p>{{TicketTitle}}</p>', $result['rules']['created']['body']);
        $this->putJson($this->path('configuration/email'), [...$input, 'appUrl' => 'http://insecure.example.com'])->assertUnprocessable();
        $this->putJson($this->path('configuration/email'), [...$input, 'sender' => 'shared'])->assertUnprocessable();
        $this->asUser($this->user('admin', $this->other))->getJson('/api/v1/departments/'.$this->other.'/configuration/email')->assertOk()->assertExactJson([]);
        $this->getJson($this->path('configuration/email'))->assertNotFound();
        $this->assertDatabaseHas('audit_events', ['action' => 'department.email.saved']);
    }

    public function test_teams_require_local_membership_and_validate_leads_and_category_ownership(): void
    {
        $agent = $this->user('agent');
        $outsider = $this->user('agent', $this->other);
        $category = DB::table('categories')->insertGetId(['organization_id' => $this->org->id, 'name' => 'Network']);
        $unit = ['title' => 'Infrastructure', 'email' => '', 'active' => true, 'method' => 'Round robin', 'categoryIds' => [$category]];
        $team = $this->asUser($this->admin)->postJson($this->path('teams'), $unit)->assertOk()->json('id');
        $this->postJson($this->path('teams'), [...$unit, 'title' => 'Applications'])->assertUnprocessable();
        $this->postJson($this->path('teams'), $unit)->assertUnprocessable();
        $member = ['unitId' => $team, 'userId' => $agent->id, 'available' => true, 'order' => 1];
        $memberId = $this->postJson($this->path('team-members'), $member)->assertOk()->json('id');
        $this->postJson($this->path('team-members'), $member)->assertUnprocessable();
        $this->postJson($this->path('team-members'), [...$member, 'userId' => $outsider->id])->assertUnprocessable();
        $this->patchJson($this->path('teams/'.$team), [...$unit, 'teamLeadMemberId' => $memberId])->assertOk();
        $this->patchJson($this->path('teams/'.$team), [...$unit, 'method' => 'Team lead'])->assertUnprocessable();
        $this->patchJson($this->path('teams/'.$team), [...$unit, 'teamLeadMemberId' => 9999])->assertUnprocessable();
        $this->getJson($this->path('teams'))->assertJsonCount(1, 'units')->assertJsonCount(1, 'members')->assertJsonPath('units.0.teamLeadMemberId', $memberId);
        $this->getJson($this->path('teams/candidates'))->assertJsonCount(2);
        $this->asUser($this->user('admin', $this->other))->patchJson('/api/v1/departments/'.$this->other.'/teams/'.$team, $unit)->assertNotFound();
        $this->postJson('/api/v1/departments/'.$this->other.'/team-members', $member)->assertNotFound();
    }

    public function test_settings_permissions_and_organization_boundary_are_enforced(): void
    {
        $this->asUser($this->user('agent'))->getJson($this->path('teams'))->assertForbidden();
        $this->getJson($this->path('configuration/sla'))->assertForbidden();
        $this->getJson($this->path('configuration/email'))->assertForbidden();
        DB::table('departments')->where('id', $this->department)->update(['role_settings' => json_encode(['admin' => ['scope' => 'all', 'actions' => ['tickets'], 'pageAccess' => ['settings', 'roles', 'sla', 'email', 'units']]])]);
        $this->asUser($this->admin)->getJson($this->path('teams'))->assertForbidden();
        $this->getJson($this->path('configuration/sla'))->assertForbidden();
        $this->getJson($this->path('configuration/email'))->assertForbidden();
        $otherOrg = Organization::create(['slug' => 'other', 'name' => 'Other', 'entra_tenant_id' => (string) Str::uuid(), 'allowed_client_ids' => [], 'status' => 'active']);
        $id = DB::table('departments')->insertGetId(['organization_id' => $otherOrg->id, 'name' => 'IT']);
        $this->asUser($this->user('superAdmin'))->getJson('/api/v1/departments/'.$id.'/teams')->assertNotFound();
        $this->getJson('/api/v1/departments/'.$id.'/configuration/email')->assertNotFound();
    }
}
