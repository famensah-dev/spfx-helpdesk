<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class DepartmentAccess
{
    public const ACTIONS = ['dashboard', 'tickets', 'create', 'edit', 'status', 'assign', 'priority', 'archive', 'comment', 'classifications'];

    public const SCOPES = ['assigned', 'assignedOrCreated', 'newUnassigned', 'all'];

    public function departments(User $user): Builder
    {
        $query = DB::table('departments')->where('departments.organization_id', $user->organization_id)->where('departments.active', true);
        if ($user->role !== 'superAdmin') {
            $query->where(function ($query) use ($user) {
                $query->whereIn('departments.id', DB::table('department_memberships')->where('organization_id', $user->organization_id)->where('user_id', $user->id)->select('department_id'));
                if ($user->verifiedEntraGroupIds()) {
                    $query->orWhereIn('departments.id', DB::table('department_entra_groups')->where('organization_id', $user->organization_id)->whereIn('entra_group_id', $user->verifiedEntraGroupIds())->select('department_id'));
                }
            });
        }

        return $query;
    }

    public function allows(User $user, ?int $departmentId): bool
    {
        return $user->hasOrganizationAccess() && ($departmentId === null
            ? $user->role === 'superAdmin'
            : $this->departments($user)->where('departments.id', $departmentId)->exists());
    }

    public function rules(User $user, ?int $departmentId): array
    {
        if ($user->role === 'superAdmin') {
            return ['id' => 'superAdmin', 'name' => 'Super Admin', 'scope' => 'all', 'actions' => self::ACTIONS];
        }
        $defaults = [
            'requester' => ['name' => 'Requester', 'scope' => 'own', 'actions' => ['tickets', 'create', 'comment']],
            'agent' => ['name' => 'Agent', 'scope' => 'assignedOrCreated', 'actions' => ['dashboard', 'tickets', 'create', 'edit', 'status', 'comment']],
            'admin' => ['name' => 'Helpdesk Admin', 'scope' => 'all', 'actions' => self::ACTIONS],
        ];
        $rule = $defaults[$user->role] ?? ['name' => 'No access', 'scope' => 'own', 'actions' => []];
        if ($departmentId !== null && $user->role !== 'requester') {
            $json = DB::table('departments')->where('organization_id', $user->organization_id)->where('id', $departmentId)->value('role_settings');
            $saved = $json ? json_decode($json, true, 512, JSON_THROW_ON_ERROR) : [];
            $rule = $saved[$user->role] ?? $rule;
        }

        return ['id' => $user->role, ...$rule];
    }

    public function can(User $user, ?int $departmentId, string $action): bool
    {
        return $this->allows($user, $departmentId) && in_array($action, $this->rules($user, $departmentId)['actions'], true);
    }

    /** No mapping rows means the lookup is shared by all departments in this organization. */
    public function lookupAvailable(User $user, string $kind, int $id, ?int $departmentId): bool
    {
        $mapping = $kind === 'issueType' ? 'issue_type_departments' : 'category_departments';
        $column = $kind === 'issueType' ? 'issue_type_id' : 'category_id';
        $query = DB::table($mapping)->where('organization_id', $user->organization_id)->where($column, $id);

        return ! (clone $query)->exists() || ($departmentId !== null && $query->where('department_id', $departmentId)->exists());
    }
}
