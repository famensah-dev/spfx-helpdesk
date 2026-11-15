<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\DepartmentAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function directory(Request $request)
    {
        abort_unless($request->user()->isAdmin(), 403);
        $input = $request->validate(['search' => ['required', 'string', 'min:2', 'max:255']]);
        $query = User::where('organization_id', $request->user()->organization_id);
        if ($request->user()->role !== 'superAdmin') {
            $ids = app(DepartmentAccess::class)->departments($request->user())->pluck('departments.id');
            $query->whereIn('id', DB::table('department_memberships')->where('organization_id', $request->user()->organization_id)->whereIn('department_id', $ids)->select('user_id'));
        }

        return $query->where(fn ($q) => $q->where('name', 'like', '%'.$input['search'].'%')->orWhere('email', 'like', '%'.$input['search'].'%'))->orderBy('name')->limit(50)->get(['id', 'name', 'email', 'entra_object_id']);
    }

    public function resolve(Request $request)
    {
        $department = $request->integer('department_id');
        abort_unless($request->user()->role === 'superAdmin' || app(DepartmentAccess::class)->canManageUsers($request->user(), $department), 403);
        $org = $request->user()->organization;
        $input = $request->validate(['entra_object_id' => ['required', 'uuid'], 'name' => ['required', 'string', 'max:255'], 'email' => ['required', 'email', 'max:255']]);
        $existing = User::where('organization_id', $org->id)->where('entra_object_id', strtolower($input['entra_object_id']))->first();
        if ($existing) {
            return $existing->only(['id', 'name', 'email', 'entra_object_id']);
        }
        $request->validate(['email' => [Rule::unique('users')->where('organization_id', $org->id)]]);
        $user = User::create([...$input, 'entra_object_id' => strtolower($input['entra_object_id']), 'organization_id' => $org->id, 'tenant_id' => $org->entra_tenant_id, 'role' => 'requester', 'enabled' => false]);

        return response()->json($user->only(['id', 'name', 'email', 'entra_object_id']), 201);
    }

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
            $query->where(fn ($q) => $q->where('role', 'superAdmin')->orWhereIn('id', DB::table('department_memberships')->where('organization_id', $request->user()->organization_id)->whereIn('department_id', $ids)->select('user_id')));
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
