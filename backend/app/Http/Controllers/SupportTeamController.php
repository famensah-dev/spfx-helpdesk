<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\DepartmentAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class SupportTeamController extends Controller
{
    private function authorizeTeam(Request $request, int $department): void
    {
        $access = app(DepartmentAccess::class);
        abort_unless($access->allows($request->user(), $department), 404);
        abort_unless($request->user()->isAdmin() && $access->can($request->user(), $department, 'manageTeams') && $access->canAccessSettings($request->user(), $department, 'units'), 403);
    }

    private function teams(Request $request, int $department)
    {
        return DB::table('support_teams')->where('organization_id', $request->user()->organization_id)->where('department_id', $department);
    }

    public function index(Request $request, int $department)
    {
        $this->authorizeTeam($request, $department);
        $org = $request->user()->organization_id;
        $links = DB::table('support_team_categories')->where('organization_id', $org)->where('department_id', $department)->get();

        return [
            'units' => $this->teams($request, $department)->orderBy('name')->get()->map(fn ($row) => ['id' => (int) $row->id, 'title' => $row->name, 'email' => $row->email ?? '', 'active' => (bool) $row->active, 'method' => $row->method, 'lastMemberId' => 0, 'teamLeadMemberId' => $row->lead_member_id ? (int) $row->lead_member_id : null, 'categoryIds' => $links->where('team_id', $row->id)->pluck('category_id')->map(fn ($id) => (int) $id)->values()]),
            'members' => DB::table('support_team_members')->join('users', 'users.id', '=', 'support_team_members.user_id')->where('support_team_members.organization_id', $org)->where('support_team_members.department_id', $department)->get(['support_team_members.*', 'users.name'])->map(fn ($row) => ['id' => (int) $row->id, 'unitId' => (int) $row->team_id, 'userId' => (int) $row->user_id, 'name' => $row->name, 'available' => (bool) $row->available, 'order' => (int) $row->sort_order]),
            'categories' => DB::table('categories')->where('organization_id', $org)->where('active', true)->orderBy('name')->get()->filter(fn ($row) => app(DepartmentAccess::class)->lookupAvailable($request->user(), 'category', $row->id, $department))->map(fn ($row) => ['id' => (int) $row->id, 'title' => $row->name])->values(),
            'autoAssignEnabled' => false,
        ];
    }

    public function save(Request $request, int $department, ?int $id = null)
    {
        $this->authorizeTeam($request, $department);
        if ($id !== null) {
            abort_unless($this->teams($request, $department)->where('id', $id)->exists(), 404);
        }
        $org = $request->user()->organization_id;
        $input = $request->validate([
            'title' => ['required', 'string', 'max:255'], 'email' => ['nullable', 'email', 'max:254'],
            'active' => ['required', 'boolean'], 'method' => ['required', Rule::in(['Round robin', 'Team lead'])],
            'teamLeadMemberId' => ['nullable', 'integer', 'min:0'],
            'categoryIds' => ['present', 'array', 'max:200'], 'categoryIds.*' => ['integer', 'distinct', Rule::exists('categories', 'id')->where('organization_id', $org)->where('active', true)],
        ]);

        return DB::transaction(function () use ($request, $org, $department, $id, $input) {
            DB::table('departments')->where('organization_id', $org)->where('id', $department)->lockForUpdate()->first();
            abort_if($this->teams($request, $department)->where('name', $input['title'])->when($id, fn ($q) => $q->where('id', '!=', $id))->exists(), 422, 'A team with this name already exists.');
            $lead = $input['teamLeadMemberId'] ?? null;
            abort_if($input['method'] === 'Team lead' && ! $lead, 422, 'Choose a team lead before using team-lead assignment.');
            if ($lead) {
                abort_unless($id && DB::table('support_team_members')->where('organization_id', $org)->where('department_id', $department)->where('team_id', $id)->where('id', $lead)->exists(), 422, 'Choose a member of this team as its lead.');
            }
            foreach ($input['categoryIds'] as $category) {
                abort_unless(app(DepartmentAccess::class)->lookupAvailable($request->user(), 'category', $category, $department), 422, 'Choose categories available to this department.');
                abort_if($input['active'] && DB::table('support_team_categories')->join('support_teams', 'support_teams.id', '=', 'support_team_categories.team_id')->where('support_team_categories.organization_id', $org)->where('support_team_categories.department_id', $department)->where('category_id', $category)->where('support_teams.active', true)->when($id, fn ($q) => $q->where('team_id', '!=', $id))->exists(), 422, 'An active team already handles this category.');
            }
            $values = ['name' => $input['title'], 'email' => $input['email'] ?? null, 'active' => $input['active'], 'method' => $input['method'], 'lead_member_id' => $lead ?: null, 'updated_at' => now()];
            if ($id) {
                $this->teams($request, $department)->where('id', $id)->update($values);
            } else {
                $id = DB::table('support_teams')->insertGetId([...$values, 'organization_id' => $org, 'department_id' => $department, 'created_at' => now()]);
            }
            DB::table('support_team_categories')->where('organization_id', $org)->where('team_id', $id)->delete();
            foreach ($input['categoryIds'] as $category) {
                DB::table('support_team_categories')->insert(['organization_id' => $org, 'department_id' => $department, 'team_id' => $id, 'category_id' => $category]);
            }
            $this->audit($request, $department, $id, 'saved');

            return response()->json(['id' => $id]);
        });
    }

    public function candidates(Request $request, int $department)
    {
        $this->authorizeTeam($request, $department);

        return User::where('organization_id', $request->user()->organization_id)->where('enabled', true)->whereIn('role', ['agent', 'admin', 'superAdmin'])->orderBy('name')->get()->filter(fn ($user) => app(DepartmentAccess::class)->allows($user, $department))->map(fn ($user) => ['id' => $user->entra_object_id ?? (string) $user->id, 'sharePointId' => $user->id, 'displayName' => $user->name, 'email' => $user->email, 'userPrincipalName' => $user->email])->values();
    }

    public function saveMember(Request $request, int $department, ?int $id = null)
    {
        $this->authorizeTeam($request, $department);
        $org = $request->user()->organization_id;
        $input = $request->validate(['unitId' => ['required', 'integer'], 'userId' => ['required', 'integer'], 'available' => ['required', 'boolean'], 'order' => ['required', 'integer', 'between:0,100000']]);

        return DB::transaction(function () use ($request, $org, $department, $id, $input) {
            abort_unless($this->teams($request, $department)->where('id', $input['unitId'])->lockForUpdate()->first(), 404);
            $member = $id ? DB::table('support_team_members')->where('organization_id', $org)->where('department_id', $department)->where('team_id', $input['unitId'])->where('id', $id)->first() : null;
            abort_if($id && ! $member, 404);
            $user = User::where('organization_id', $org)->where('enabled', true)->whereIn('role', ['agent', 'admin', 'superAdmin'])->find($input['userId']);
            abort_unless($user && app(DepartmentAccess::class)->allows($user, $department), 422, 'Add an enabled Agent or Administrator to this department before adding them to a support team.');
            abort_if(DB::table('support_team_members')->where('organization_id', $org)->where('team_id', $input['unitId'])->where('user_id', $user->id)->when($id, fn ($q) => $q->where('id', '!=', $id))->exists(), 422, 'This user is already a member of the team.');
            $values = ['user_id' => $user->id, 'available' => $input['available'], 'sort_order' => $input['order']];
            if ($id) {
                DB::table('support_team_members')->where('organization_id', $org)->where('id', $id)->update($values);
            } else {
                $id = DB::table('support_team_members')->insertGetId([...$values, 'organization_id' => $org, 'department_id' => $department, 'team_id' => $input['unitId']]);
            }
            $this->audit($request, $department, $input['unitId'], 'member.saved');

            return response()->json(['id' => $id]);
        });
    }

    private function audit(Request $request, int $department, int $team, string $event): void
    {
        DB::table('audit_events')->insert(['organization_id' => $request->user()->organization_id, 'user_id' => $request->user()->id, 'action' => 'support.team.'.$event, 'changes' => json_encode(['department_id' => $department, 'team_id' => $team]), 'created_at' => now()]);
    }
}
