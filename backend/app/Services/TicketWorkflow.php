<?php

namespace App\Services;

use App\Models\Ticket;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

class TicketWorkflow
{
    private const TERMINAL = ['Resolved', 'Completed', 'Closed'];

    public function create(User $user, array $input): Ticket
    {
        abort_unless($user->hasOrganizationAccess(), 403);
        abort_unless(in_array($user->role, ['requester', 'agent', 'admin', 'superAdmin'], true), 403);
        $access = app(DepartmentAccess::class);
        $departmentId = isset($input['departmentId']) ? (int) $input['departmentId'] : null;
        if ($departmentId === null) {
            $departments = $access->departments($user)->pluck('id');
            if ($departments->count() === 1) {
                $departmentId = (int) $departments->first();
            } elseif ($departments->isNotEmpty() || $user->role !== 'superAdmin') {
                throw ValidationException::withMessages(['departmentId' => 'Choose an accessible department.']);
            }
        }
        abort_unless($access->can($user, $departmentId, 'create'), 403);
        $input['departmentId'] = $departmentId;
        abort_if(! $user->isAdmin() && (($user->role !== 'agent' && ! empty($input['assignedToId'])) || ($input['status'] ?? 'New') !== 'New' || ! empty($input['archived']) || ! empty($input['resolutionSummary']) || ! empty($input['dueDate'])), 403);
        foreach (['assignedToId' => 'assign', 'archived' => 'archive', 'resolutionSummary' => 'edit', 'dueDate' => 'edit'] as $key => $action) {
            if (! empty($input[$key]) && ! ($key === 'assignedToId' && $user->role === 'agent')) {
                abort_unless($access->can($user, $departmentId, $action), 403);
            }
        }
        if (($input['status'] ?? 'New') !== 'New') {
            abort_unless($access->can($user, $departmentId, 'status'), 403);
        }
        $this->validateAssignee($user, $input);
        $input = $this->classificationInput($user, $input);

        return DB::transaction(function () use ($user, $input) {
            $ticket = new Ticket(['organization_id' => $user->organization_id, 'requester_id' => $user->id, 'created_by_id' => $user->id, 'status' => 'New']);
            $this->fill($ticket, $input);
            $ticket->save();
            $this->audit($user, $ticket, 'ticket.created', $ticket->getAttributes());

            return $ticket;
        });
    }

    public function update(User $user, Ticket $ticket, array $input): void
    {
        DB::transaction(function () use ($user, $ticket, $input) {
            $ticket = Ticket::where('organization_id', $user->organization_id)->lockForUpdate()->findOrFail($ticket->id);
            Gate::forUser($user)->authorize('update', $ticket);
            abort_if(array_key_exists('departmentId', $input) && ($input['departmentId'] === null ? null : (int) $input['departmentId']) !== $ticket->department_id, 422, 'Ticket department cannot be changed through a normal edit.');
            $input = $this->classificationInput($user, $input, $ticket);
            $this->validateAssignee($user, [...$input, 'departmentId' => $ticket->department_id]);
            $access = app(DepartmentAccess::class);
            if ($user->role !== 'superAdmin') {
                foreach (['title', 'description'] as $key) {
                    abort_if(array_key_exists($key, $input) && $input[$key] !== $ticket->$key && $ticket->created_by_id !== $user->id, 403, 'Only the ticket creator can change its title or description.');
                }
            }
            foreach (['title' => 'title', 'description' => 'description', 'category' => 'category_id', 'subcategory' => 'subcategory_id', 'issueType' => 'issue_type_id', 'priority' => 'priority', 'status' => 'status', 'assignedToId' => 'assigned_to_id', 'archived' => 'archived', 'dueDate' => 'due_date', 'resolutionSummary' => 'resolution_summary'] as $key => $column) {
                if (! array_key_exists($key, $input) || $input[$key] === $ticket->$column) {
                    continue;
                }
                $action = match ($key) {
                    'priority' => 'priority', 'status' => 'status', 'assignedToId' => 'assign', 'archived' => 'archive', default => 'edit',
                };
                $creatorAssignment = $key === 'assignedToId' && $user->role === 'agent' && $ticket->created_by_id === $user->id && $access->can($user, $ticket->department_id, 'create');
                abort_if($key === 'assignedToId' && $user->role === 'agent' && $ticket->created_by_id !== $user->id, 403, 'Agents may assign only tickets they created.');
                abort_unless($creatorAssignment || $access->can($user, $ticket->department_id, $action), 403);
                $scope = $access->rules($user, $ticket->department_id)['scope'];
                if ($user->role === 'agent' && in_array($scope, ['assigned', 'assignedOrCreated'], true)) {
                    abort_unless($creatorAssignment || $ticket->assigned_to_id === $user->id || (in_array($key, ['title', 'description', 'category', 'subcategory', 'issueType', 'dueDate'], true) && $ticket->created_by_id === $user->id), 403);
                }
            }
            if (! $user->isAdmin()) {
                $next = $input['status'] ?? $ticket->status;
                abort_if(($next === 'Closed' && $ticket->status !== 'Closed') || (in_array($ticket->status, self::TERMINAL, true) && ! in_array($next, self::TERMINAL, true)), 403, 'Only administrators may close or reopen tickets.');
                abort_if(array_key_exists('resolutionSummary', $input) && ! trim($input['resolutionSummary'] ?? ''), 403, 'Only administrators may clear a resolution.');
            }
            $this->fill($ticket, $input);
            $changes = $ticket->getDirty();
            $ticket->save();
            if ($changes) {
                $this->audit($user, $ticket, 'ticket.updated', $changes);
            }
        });
    }

    private function validateAssignee(User $user, array $input): void
    {
        if (isset($input['assignedToId'])) {
            $assignee = User::where('organization_id', $user->organization_id)->where('enabled', true)->whereIn('role', ['agent', 'admin', 'superAdmin'])->find($input['assignedToId']);
            abort_unless($assignee && app(DepartmentAccess::class)->allows($assignee, $input['departmentId'] ?? null), 422, 'Choose an enabled assignee from the ticket department.');
        }
    }

    private function classificationInput(User $user, array $input, ?Ticket $ticket = null): array
    {
        $columns = ['category' => 'category_id', 'subcategory' => 'subcategory_id', 'issueType' => 'issue_type_id'];
        $tables = ['category' => 'categories', 'subcategory' => 'subcategories', 'issueType' => 'issue_types'];
        $departmentId = $ticket?->department_id ?? $input['departmentId'] ?? null;
        $access = app(DepartmentAccess::class);
        foreach ($columns as $key => $column) {
            if (! array_key_exists($key, $input)) {
                continue;
            }
            $value = $input[$key];
            if ($value !== null && $value !== '' && (! ctype_digit((string) $value) || (int) $value < 1)) {
                throw ValidationException::withMessages([$key => 'Choose a valid lookup ID.']);
            }
            $input[$key] = $value === null || $value === '' ? null : (int) $value;
            if ($input[$key] !== null) {
                $query = DB::table($tables[$key])->where('organization_id', $user->organization_id)->where('id', $input[$key]);
                if ($input[$key] !== $ticket?->$column) {
                    $query->where('active', true);
                }
                if (! $query->exists()) {
                    throw ValidationException::withMessages([$key => 'Choose an active lookup from your organization.']);
                }
                $categoryId = $key === 'subcategory' ? DB::table('subcategories')->where('id', $input[$key])->value('category_id') : $input[$key];
                if ($input[$key] !== $ticket?->$column && ! $access->lookupAvailable($user, $key === 'issueType' ? 'issueType' : 'category', (int) $categoryId, $departmentId)) {
                    throw ValidationException::withMessages([$key => 'This option is not available to the ticket department.']);
                }
            }
        }
        if ($ticket && array_key_exists('category', $input) && $input['category'] !== $ticket->category_id && ! array_key_exists('subcategory', $input)) {
            $input['subcategory'] = null;
        }
        $category = $input['category'] ?? (array_key_exists('category', $input) ? null : $ticket?->category_id);
        $subcategory = $input['subcategory'] ?? (array_key_exists('subcategory', $input) ? null : $ticket?->subcategory_id);
        if ($subcategory !== null && ($category === null || ! DB::table('subcategories')->where('organization_id', $user->organization_id)->where('id', $subcategory)->where('category_id', $category)->exists())) {
            throw ValidationException::withMessages(['subcategory' => 'Choose a subcategory belonging to the selected category.']);
        }

        return $input;
    }

    private function fill(Ticket $ticket, array $input): void
    {
        foreach (['title' => 'title', 'departmentId' => 'department_id', 'description' => 'description', 'category' => 'category_id', 'subcategory' => 'subcategory_id', 'issueType' => 'issue_type_id', 'priority' => 'priority', 'status' => 'status', 'assignedToId' => 'assigned_to_id', 'resolutionSummary' => 'resolution_summary', 'dueDate' => 'due_date', 'archived' => 'archived'] as $key => $column) {
            if (array_key_exists($key, $input)) {
                $ticket->$column = $key === 'description' && ($input[$key] === null || trim($input[$key]) === '') ? null : $input[$key];
            }
        }
        if ($ticket->isDirty('status')) {
            $ticket->resolved_at = in_array($ticket->status, self::TERMINAL, true) ? ($ticket->resolved_at ?? now()) : null;
        }
    }

    public function audit(User $user, Ticket $ticket, string $action, array $changes): void
    {
        abort_unless($user->organization_id !== null && $ticket->organization_id === $user->organization_id, 403);
        DB::table('audit_events')->insert(['organization_id' => $user->organization_id, 'user_id' => $user->id, 'ticket_id' => $ticket->id, 'action' => $action, 'changes' => json_encode($changes, JSON_THROW_ON_ERROR), 'created_at' => now()]);
    }
}
