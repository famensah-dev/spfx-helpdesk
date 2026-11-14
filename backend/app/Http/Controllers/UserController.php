<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\DepartmentAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function index(Request $request)
    {
        abort_unless($request->user()->role === 'superAdmin', 403);

        return User::where('organization_id', $request->user()->organization_id)->orderBy('name')->get(['id', 'entra_object_id', 'name', 'email', 'role', 'enabled']);
    }

    public function assignees(Request $request)
    {
        abort_unless(in_array($request->user()->role, ['agent', 'admin', 'superAdmin'], true), 403);

        $query = User::where('organization_id', $request->user()->organization_id)->where('enabled', true)->whereIn('role', ['agent', 'admin', 'superAdmin']);
        if ($request->user()->role !== 'superAdmin') {
            $ids = app(DepartmentAccess::class)->departments($request->user())->pluck('departments.id');
            $query->where(fn ($q) => $q->where('role', 'superAdmin')->orWhereIn('id', DB::table('department_memberships')->where('organization_id', $request->user()->organization_id)->whereIn('department_id', $ids)->select('user_id'))->orWhereIn('id', DB::table('user_entra_group_cache')->join('department_entra_groups', function ($join) {
                $join->on('user_entra_group_cache.entra_group_id', '=', 'department_entra_groups.entra_group_id')->on('user_entra_group_cache.organization_id', '=', 'department_entra_groups.organization_id');
            })->where('user_entra_group_cache.organization_id', $request->user()->organization_id)->where('expires_at', '>', now())->whereIn('department_entra_groups.department_id', $ids)->select('user_entra_group_cache.user_id')));
        }

        return $query->orderBy('name')->get(['id', 'entra_object_id', 'name', 'email']);
    }

    public function store(Request $request)
    {
        abort_unless($request->user()->role === 'superAdmin', 403);
        $organization = $request->user()->organization;
        $identity = $request->validate(['entra_object_id' => ['required', 'uuid'], 'organization_id' => ['prohibited'], 'tenant_id' => ['prohibited']]);
        $existing = User::where('organization_id', $organization->id)->where('entra_object_id', strtolower($identity['entra_object_id']))->first();
        $input = $request->validate(['entra_object_id' => ['required', 'uuid'], 'name' => ['required', 'string', 'max:255'], 'email' => ['required', 'email', 'max:255', Rule::unique('users')->where('organization_id', $organization->id)->ignore($existing?->id)], 'role' => ['required', Rule::in(['requester', 'agent', 'admin', 'superAdmin'])], 'enabled' => ['required', 'boolean']]);
        abort_if(strtolower($input['entra_object_id']) === strtolower($request->user()->entra_object_id), 422, 'You cannot change your own user access.');
        $input['entra_object_id'] = strtolower($input['entra_object_id']);
        DB::transaction(function () use ($request, $input, $organization) {
            $user = User::updateOrCreate(['organization_id' => $organization->id, 'entra_object_id' => strtolower($input['entra_object_id'])], [...$input, 'tenant_id' => $organization->entra_tenant_id]);
            DB::table('audit_events')->insert(['organization_id' => $organization->id, 'user_id' => $request->user()->id, 'action' => 'user.saved', 'changes' => json_encode(['user' => $user->id, 'role' => $user->role, 'enabled' => $user->enabled], JSON_THROW_ON_ERROR), 'created_at' => now()]);
        });

        return response()->noContent();
    }
}
