<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\DepartmentAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DepartmentController extends Controller
{
    public function index(Request $request, DepartmentAccess $access)
    {
        return $access->departments($request->user())->orderBy('name')->get(['id', 'name'])->map(fn ($row) => ['id' => (int) $row->id, 'name' => $row->name]);
    }

    public function create(Request $request)
    {
        abort_unless($request->user()->role === 'superAdmin', 403);
        $org = $request->user()->organization_id;
        $input = $request->validate(['name' => ['required', 'string', 'max:255', Rule::unique('departments')->where('organization_id', $org)], 'organization_id' => ['prohibited']]);
        $id = DB::table('departments')->insertGetId([...$input, 'organization_id' => $org, 'created_at' => now(), 'updated_at' => now()]);

        return response()->json(['id' => $id, ...$input], 201);
    }

    public function show(Request $request, DepartmentAccess $access, int $id)
    {
        $this->authorizeDepartment($request, $access, $id);
        $user = clone $request->user();
        $rules = [];
        foreach (['requester', 'agent', 'admin'] as $role) {
            $user->role = $role;
            $rules[$role] = $access->rules($user, $id);
        }

        return [
            'roles' => $rules,
            'can_manage_users' => $access->canManageUsers($request->user(), $id),
            'members' => User::where('organization_id', $user->organization_id)->whereIn('id', DB::table('department_memberships')->where('organization_id', $user->organization_id)->where('department_id', $id)->select('user_id'))->get()->map(fn ($row) => ['id' => (int) $row->id, 'name' => $row->name, 'email' => $row->email, 'role' => $row->role, 'enabled' => (bool) $row->enabled, 'created_at' => $row->created_at, 'can_manage' => $access->canManageUser($request->user(), $row, $id)]),
            'entra_group_ids' => DB::table('department_entra_groups')->where('organization_id', $user->organization_id)->where('department_id', $id)->pluck('entra_group_id'),
        ];
    }

    public function save(Request $request, DepartmentAccess $access, int $id)
    {
        $this->authorizeDepartment($request, $access, $id);
        $org = $request->user()->organization_id;
        $input = $request->validate([
            'member_ids' => ['sometimes', 'array'],
            'member_ids.*' => ['required', 'integer', 'distinct', Rule::exists('users', 'id')->where('organization_id', $org)],
            'entra_group_ids' => ['sometimes', 'array'], 'entra_group_ids.*' => ['required', 'uuid', 'distinct:ignore_case'],
            'roles' => ['sometimes', 'array:agent,admin'],
            'roles.agent' => ['required_with:roles', 'array:name,scope,actions,pageAccess'],
            'roles.admin' => ['required_with:roles', 'array:name,scope,actions,pageAccess'],
            'roles.*.name' => ['required', 'string', 'max:255'],
            'roles.*.scope' => ['required', Rule::in(DepartmentAccess::SCOPES)],
            'roles.*.actions' => ['present', 'array'],
            'roles.agent.actions.*' => ['required', 'distinct', Rule::in(DepartmentAccess::CONFIGURABLE_ACTIONS)],
            'roles.admin.actions.*' => ['required', 'distinct', Rule::in(DepartmentAccess::CONFIGURABLE_ACTIONS)],
            'roles.*.pageAccess' => ['sometimes', 'array'],
            'roles.agent.pageAccess.*' => ['required', 'distinct', Rule::in(DepartmentAccess::SETTINGS_PAGES)],
            'roles.admin.pageAccess.*' => ['required', 'distinct', Rule::in(DepartmentAccess::SETTINGS_PAGES)],
            'organization_id' => ['prohibited'],
        ]);
        // Membership grants and directory mappings are owner-controlled, independent of role editing.
        abort_if($request->user()->role !== 'superAdmin' && (isset($input['member_ids']) || isset($input['entra_group_ids'])), 403);
        if ($request->user()->role !== 'superAdmin' && isset($input['roles'])) {
            foreach (['agent', 'admin'] as $role) {
                $target = clone $request->user();
                $target->role = $role;
                abort_if(in_array('manageUsers', $input['roles'][$role]['actions'], true) !== in_array('manageUsers', $access->rules($target, $id)['actions'], true), 403, 'Only Super Admins may grant or revoke user-management authority.');
            }
        }
        DB::transaction(function () use ($request, $input, $org, $id) {
            if (isset($input['roles'])) {
                DB::table('departments')->where('organization_id', $org)->where('id', $id)->update(['role_settings' => json_encode($input['roles'], JSON_THROW_ON_ERROR), 'updated_at' => now()]);
            }
            foreach (['member_ids' => ['department_memberships', 'user_id'], 'entra_group_ids' => ['department_entra_groups', 'entra_group_id']] as $key => [$table, $column]) {
                if (array_key_exists($key, $input)) {
                    DB::table($table)->where('organization_id', $org)->where('department_id', $id)->delete();
                    foreach ($input[$key] as $value) {
                        DB::table($table)->insert(['organization_id' => $org, 'department_id' => $id, $column => $column === 'entra_group_id' ? strtolower($value) : $value]);
                    }
                }
            }
            DB::table('audit_events')->insert(['organization_id' => $org, 'user_id' => $request->user()->id, 'action' => 'department.saved', 'changes' => json_encode(['department_id' => $id, ...$input], JSON_THROW_ON_ERROR), 'created_at' => now()]);
        });

        return response()->noContent();
    }

    private function authorizeDepartment(Request $request, DepartmentAccess $access, int $id): void
    {
        abort_unless($request->user()->isAdmin(), 403);
        abort_unless($access->allows($request->user(), $id), 404);
        abort_unless($access->canAccessSettings($request->user(), $id, 'roles'), 403);
    }
}
