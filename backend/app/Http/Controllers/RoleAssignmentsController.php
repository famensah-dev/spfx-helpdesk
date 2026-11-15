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
        abort_unless($access->allows($request->user(), $id), 404);
        abort_unless($access->canManageUsers($request->user(), $id), 403, 'You do not have permission to manage users in this department.');
        $org = $request->user()->organization_id;
        $input = $request->validate([
            'assignments' => ['present', 'array'],
            'assignments.*.userId' => ['required', 'integer', 'distinct', Rule::exists('users', 'id')->where('organization_id', $org)->whereNot('role', 'superAdmin')],
            'assignments.*.roleId' => ['required', Rule::in(['requester', 'agent', 'admin'])],
            'assignments.*.disabled' => ['sometimes', 'boolean'],
        ]);
        DB::transaction(function () use ($request, $access, $org, $id, $input) {
            DB::table('departments')->where('organization_id', $org)->where('id', $id)->lockForUpdate()->first();
            // Removing a direct assignment does not alter another department or an Entra group.
            $ids = array_column($input['assignments'], 'userId');
            $existing = DB::table('department_memberships')->where('organization_id', $org)->where('department_id', $id)->pluck('user_id')->all();
            $targets = User::where('organization_id', $org)->whereIn('id', array_unique([...$ids, ...$existing]))->lockForUpdate()->get()->keyBy('id');
            foreach ($input['assignments'] as $assignment) {
                $target = $targets[$assignment['userId']];
                $changed = ! in_array($target->id, $existing) || $target->role !== $assignment['roleId'] || $target->enabled !== ! ($assignment['disabled'] ?? false);
                abort_if($changed && ! $access->canManageUser($request->user(), $target, $id), 403, 'This user has protected access or belongs to another department you cannot manage.');
            }
            foreach (array_diff($existing, $ids) as $removed) {
                $target = $targets[$removed];
                abort_if($target->role !== 'superAdmin' && ! $access->canManageUser($request->user(), $target, $id), 403, 'You cannot remove this user.');
            }
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
