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
        $pages = [];
        foreach ($departments as $department) {
            $actions = array_merge($actions, $access->rules($user, $department->id)['actions']);
            $pages = array_merge($pages, $access->settingsPages($user, $department->id));
        }
        $actions = $user->role === 'superAdmin' ? DepartmentAccess::ACTIONS : array_values(array_intersect(DepartmentAccess::ACTIONS, array_unique($actions)));
        $pages = $user->role === 'superAdmin' ? $access->settingsPages($user, null) : array_values(array_unique($pages));

        return [
            'access' => ['role' => $user->role, 'entra_object_id' => $user->entra_object_id, 'admin' => $user->isAdmin(), 'superAdmin' => $user->role === 'superAdmin', 'agent' => $user->role === 'agent', 'email' => $user->email, 'name' => $user->name, 'siteUrl' => ''],
            'roleRules' => ['id' => $user->role, 'name' => $user->role, 'scope' => $user->isAdmin() ? 'all' : ($user->role === 'agent' ? 'assignedOrCreated' : 'own'), 'actions' => $actions, 'pageAccess' => $pages],
            'departments' => $departments,
            'title' => $user->organization->name,
            'workspace' => ['title' => $user->organization->name, 'description' => $user->organization->description ?? '', 'listName' => 'Tickets', 'listId' => ''],
            'organization' => ['id' => $user->organization_id, 'name' => $user->organization->name, 'slug' => $user->organization->slug],
        ];
    }
}
