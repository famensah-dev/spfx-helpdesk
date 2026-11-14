<?php

namespace App\Http\Controllers;

use App\Services\DepartmentAccess;
use Illuminate\Http\Request;

class SessionController extends Controller
{
    public function __invoke(Request $request)
    {
        $user = $request->user();
        $access = app(DepartmentAccess::class);
        $departments = $access->departments($user)->orderBy('name')->get(['id', 'name']);
        $actions = [];
        foreach ($departments as $department) {
            $actions = array_merge($actions, $access->rules($user, $department->id)['actions']);
        }
        $actions = $user->role === 'superAdmin' ? DepartmentAccess::ACTIONS : array_values(array_unique($actions));

        return [
            'access' => ['role' => $user->role, 'entra_object_id' => $user->entra_object_id, 'admin' => $user->isAdmin(), 'superAdmin' => $user->role === 'superAdmin', 'agent' => $user->role === 'agent', 'email' => $user->email, 'name' => $user->name, 'siteUrl' => ''],
            'roleRules' => ['id' => $user->role, 'name' => $user->role, 'scope' => $user->isAdmin() ? 'all' : ($user->role === 'agent' ? 'assignedOrCreated' : 'own'), 'actions' => $actions, 'pageAccess' => $user->isAdmin() ? ['settings', 'roles', 'categories', 'subcategories', 'issueTypes'] : []],
            'departments' => $departments,
            'title' => $user->organization->name,
            'organization' => ['id' => $user->organization_id, 'name' => $user->organization->name, 'slug' => $user->organization->slug],
        ];
    }
}
