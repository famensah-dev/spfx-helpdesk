<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\DepartmentAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class RoleAssignmentsController extends Controller
{
    public function save(Request $request, DepartmentAccess $access, int $id)
    {
        abort_unless($request->user()->role === 'superAdmin', 403, 'Only Super Admins may change organization user access.');
        abort_unless($access->allows($request->user(), $id), 404);
        $org = $request->user()->organization_id;
        $input = $request->validate([
            'assignments' => ['present', 'array'],
            'assignments.*.userId' => ['required', 'integer', 'distinct', Rule::exists('users', 'id')->where('organization_id', $org)->whereNot('role', 'superAdmin')],
            'assignments.*.roleId' => ['required', Rule::in(['requester', 'agent', 'admin'])],
            'assignments.*.disabled' => ['sometimes', 'boolean'],
        ]);
        DB::transaction(function () use ($request, $org, $id, $input) {
            DB::table('departments')->where('organization_id', $org)->where('id', $id)->lockForUpdate()->first();
            // Removing a direct assignment does not alter another department or an Entra group.
            $ids = array_column($input['assignments'], 'userId');
            $protected = User::where('organization_id', $org)->where('role', 'superAdmin')->pluck('id');
            DB::table('department_memberships')->where('organization_id', $org)->where('department_id', $id)->whereNotIn('user_id', $ids)->whereNotIn('user_id', $protected)->delete();
            foreach ($input['assignments'] as $assignment) {
                User::where('organization_id', $org)->whereKey($assignment['userId'])->update(['role' => $assignment['roleId'], 'enabled' => ! ($assignment['disabled'] ?? false)]);
                DB::table('department_memberships')->updateOrInsert(['organization_id' => $org, 'department_id' => $id, 'user_id' => $assignment['userId']], []);
            }
            DB::table('audit_events')->insert(['organization_id' => $org, 'user_id' => $request->user()->id, 'action' => 'department.assignments.saved', 'changes' => json_encode(['department_id' => $id, ...$input], JSON_THROW_ON_ERROR), 'created_at' => now()]);
        });

        return response()->noContent();
    }
}
