<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class WorkspaceSettingsController extends Controller
{
    public function schema(Request $request)
    {
        abort_unless($request->user()->role === 'superAdmin', 403);
        $columns = collect(Schema::getColumns('tickets'))->map(fn ($column) => [
            'id' => $column['name'], 'name' => $column['name'], 'displayName' => $column['name'],
            'description' => 'Managed through Laravel migrations.', 'required' => ! $column['nullable'],
            'readOnly' => true, 'hidden' => false, 'protected' => true, 'canEdit' => false, 'canDelete' => false,
            'type' => $column['type_name'], 'properties' => (object) [],
        ])->values();

        return ['storageProvider' => 'laravel', 'listName' => 'Tickets', 'listId' => 'tickets', 'canManage' => true, 'canCreateColumns' => false, 'columns' => $columns, 'entries' => [], 'parents' => [], 'lists' => []];
    }

    public function save(Request $request)
    {
        abort_unless($request->user()->role === 'superAdmin', 403);
        $input = $request->validate(['title' => ['required', 'string', 'max:255'], 'description' => ['nullable', 'string', 'max:4000']]);
        DB::transaction(function () use ($request, $input) {
            $request->user()->organization->update(['name' => $input['title'], 'description' => $input['description'] ?? null]);
            DB::table('audit_events')->insert(['organization_id' => $request->user()->organization_id, 'user_id' => $request->user()->id, 'action' => 'workspace.settings.saved', 'changes' => json_encode($input, JSON_THROW_ON_ERROR), 'created_at' => now()]);
        });

        return response()->noContent();
    }
}
