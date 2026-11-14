<?php

namespace App\Http\Controllers;

use App\Services\DepartmentAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ClassificationController extends Controller
{
    private function table(string $kind): string
    {
        return match ($kind) {
            'categories' => 'categories',
            'subcategories' => 'subcategories',
            'issue-types' => 'issue_types',
            default => abort(404),
        };
    }

    public function options(Request $request)
    {
        $org = $request->user()->organization_id;
        $access = app(DepartmentAccess::class);
        $departments = $access->departments($request->user())->orderBy('name')->get(['id', 'name']);
        $entries = fn ($table) => DB::table($table)->where('organization_id', $org)->where('active', true)->orderBy('sort_order')->orderBy('name')->get();
        $available = fn ($kind, $row) => $departments->contains(fn ($department) => $access->lookupAvailable($request->user(), $kind, $row->id, $department->id)) || ($request->user()->role === 'superAdmin' && $access->lookupAvailable($request->user(), $kind, $row->id, null));
        $categories = $entries('categories')->filter(fn ($row) => $available('category', $row));
        $map = fn ($row) => ['id' => (string) $row->id, 'name' => $row->name];
        $mapped = function ($row, $kind) use ($map, $org) {
            $mapping = $kind === 'category' ? 'category_departments' : 'issue_type_departments';
            $column = $kind === 'category' ? 'category_id' : 'issue_type_id';

            return [...$map($row), 'departmentIds' => DB::table($mapping)->where('organization_id', $org)->where($column, $row->id)->pluck('department_id')->map(fn ($id) => (string) $id)->all()];
        };

        return [
            'priorities' => ['Low', 'Medium', 'High', 'Critical'],
            'description' => true, 'assignment' => $request->user()->isAdmin() || $request->user()->role === 'agent',
            'departments' => $departments->map(fn ($row) => ['key' => (string) $row->id, 'name' => $row->name])->values(),
            'departmentValue' => 'id',
            'ticketSources' => ['DeskPilot', 'Email', 'Forms', 'Phone / Call-in', 'Other'],
            'fields' => [
                ['key' => 'category', 'label' => 'Category', 'required' => false],
                ['key' => 'subcategory', 'label' => 'Subcategory', 'required' => false],
                ['key' => 'issueType', 'label' => 'Issue Type', 'required' => false],
                ['key' => 'ticketType', 'label' => 'Ticket Type', 'required' => false, 'choices' => ['Problem', 'Incident', 'Question', 'Request']],
                ['key' => 'dueDate', 'label' => 'Due Date', 'required' => false],
            ],
            'classification' => [
                'categories' => $categories->map(fn ($row) => $mapped($row, 'category'))->values(),
                'subcategories' => $entries('subcategories')->whereIn('category_id', $categories->pluck('id')->all())->map(fn ($row) => [...$map($row), 'parentId' => (string) $row->category_id])->values(),
                'issueTypes' => $entries('issue_types')->filter(fn ($row) => $available('issueType', $row))->map(fn ($row) => $mapped($row, 'issueType'))->values(),
                // Legacy interface only; no SharePoint lists back these options.
                'listIds' => ['category' => '', 'subcategory' => '', 'issueType' => ''],
            ],
        ];
    }

    public function index(Request $request, string $kind)
    {
        $parentRead = $kind === 'categories' && $request->query('parentsFor') === 'subcategories';
        $this->authorizePage($request, $parentRead ? 'subcategories' : $kind);

        $org = $request->user()->organization_id;

        return DB::table($this->table($kind))->where('organization_id', $org)->orderBy('sort_order')->orderBy('name')->get()->filter(function ($row) use ($request, $kind, $parentRead) {
            return $request->user()->role === 'superAdmin' || $this->canManage($request, $kind, $row->id, false, $parentRead ? 'subcategories' : null);
        })->map(function ($row) use ($request, $kind, $org) {
            $row->id = (int) $row->id;
            $row->active = (bool) $row->active;
            $row->sort_order = (int) $row->sort_order;
            if (isset($row->category_id)) {
                $row->category_id = (int) $row->category_id;
            }
            $row->can_edit = $this->canManage($request, $kind, $row->id);
            if ($kind !== 'subcategories') {
                $row->department_ids = DB::table($kind === 'categories' ? 'category_departments' : 'issue_type_departments')->where('organization_id', $org)->where($kind === 'categories' ? 'category_id' : 'issue_type_id', $row->id)->pluck('department_id')->map(fn ($id) => (int) $id)->all();
            }

            return $row;
        })->values();
    }

    public function save(Request $request, string $kind, ?string $id = null)
    {
        $this->authorizePage($request, $kind);
        $table = $this->table($kind);
        $org = $request->user()->organization_id;
        $existing = $id === null ? null : DB::table($table)->where('organization_id', $org)->where('id', $id)->first();
        abort_if($id !== null && ! $existing, 404);
        abort_if($existing && ! $this->canManage($request, $kind, (int) $id), 403);
        $input = $request->validate([
            'name' => ['required', 'string', 'max:255', Rule::unique($table)->where(fn ($q) => $q->where('organization_id', $org)->when($kind === 'subcategories', fn ($q) => $q->where('category_id', $existing?->category_id ?? $request->input('category_id'))))->ignore($id)],
            'active' => ['sometimes', 'boolean'], 'sort_order' => ['sometimes', 'integer', 'min:0'],
            'category_id' => $kind === 'subcategories' ? [$existing ? 'sometimes' : 'required', 'integer', Rule::exists('categories', 'id')->where('organization_id', $org)] : ['prohibited'],
            'organization_id' => ['prohibited'],
            'department_ids' => $kind === 'subcategories' ? ['prohibited'] : ['sometimes', 'array'],
            'department_ids.*' => ['required', 'integer', 'distinct', Rule::exists('departments', 'id')->where('organization_id', $org)->where('active', true)],
        ]);
        // Keep parent references stable for tickets already using this subcategory.
        abort_if($existing && $kind === 'subcategories' && isset($input['category_id']) && (int) $input['category_id'] !== (int) $existing->category_id, 422, 'Create a new subcategory to use a different parent.');
        $departmentIds = $input['department_ids'] ?? null;
        unset($input['department_ids']);
        if ($kind === 'subcategories') {
            abort_unless($this->canManage($request, 'categories', (int) ($input['category_id'] ?? $existing->category_id), true, 'subcategories'), 403);
        } elseif ($request->user()->role !== 'superAdmin' && ($departmentIds !== null || ! $existing)) {
            abort_unless(! empty($departmentIds), 403, 'Only Super Admins may manage organization-wide options.');
            foreach ($departmentIds as $departmentId) {
                abort_unless(app(DepartmentAccess::class)->can($request->user(), $departmentId, 'classifications'), 403);
                abort_unless(app(DepartmentAccess::class)->canAccessSettings($request->user(), $departmentId, $kind === 'issue-types' ? 'issueTypes' : $kind), 403);
            }
        }

        return DB::transaction(function () use ($request, $table, $org, $id, $input, $kind, $departmentIds) {
            if ($id === null) {
                $id = DB::table($table)->insertGetId([...$input, 'organization_id' => $org, 'created_at' => now(), 'updated_at' => now()]);
            } else {
                DB::table($table)->where('organization_id', $org)->where('id', $id)->update([...$input, 'updated_at' => now()]);
            }
            if ($kind !== 'subcategories' && $departmentIds !== null) {
                $mapping = $kind === 'categories' ? 'category_departments' : 'issue_type_departments';
                $column = $kind === 'categories' ? 'category_id' : 'issue_type_id';
                DB::table($mapping)->where('organization_id', $org)->where($column, $id)->delete();
                foreach ($departmentIds as $departmentId) {
                    DB::table($mapping)->insert(['organization_id' => $org, $column => $id, 'department_id' => $departmentId]);
                }
            }
            DB::table('audit_events')->insert(['organization_id' => $org, 'user_id' => $request->user()->id, 'action' => 'classification.saved', 'changes' => json_encode(['table' => $table, 'id' => $id, 'department_ids' => $departmentIds, ...$input], JSON_THROW_ON_ERROR), 'created_at' => now()]);

            return response()->json(DB::table($table)->where('organization_id', $org)->where('id', $id)->first());
        });
    }

    private function canManage(Request $request, string $kind, int $id, bool $write = true, ?string $pageOverride = null): bool
    {
        $user = $request->user();
        if ($user->role === 'superAdmin') {
            return true;
        }
        $page = $pageOverride ?? ($kind === 'issue-types' ? 'issueTypes' : $kind);
        if ($kind === 'subcategories') {
            $id = (int) DB::table('subcategories')->where('organization_id', $user->organization_id)->where('id', $id)->value('category_id');
            $kind = 'categories';
        }
        $ids = DB::table($kind === 'categories' ? 'category_departments' : 'issue_type_departments')->where('organization_id', $user->organization_id)->where($kind === 'categories' ? 'category_id' : 'issue_type_id', $id)->pluck('department_id');
        if ($ids->isEmpty()) {
            return ! $write;
        }
        $access = app(DepartmentAccess::class);

        $allowed = fn ($id) => $access->can($user, $id, 'classifications') && $access->canAccessSettings($user, $id, $page);

        return $write ? $ids->every($allowed) : $ids->contains($allowed);
    }

    private function authorizePage(Request $request, string $kind): void
    {
        $this->table($kind);
        $access = app(DepartmentAccess::class);
        $page = $kind === 'issue-types' ? 'issueTypes' : $kind;
        abort_unless($request->user()->role === 'superAdmin' || $access->departments($request->user())->pluck('id')->contains(fn ($id) => $access->can($request->user(), $id, 'classifications') && $access->canAccessSettings($request->user(), $id, $page)), 403);
    }
}
