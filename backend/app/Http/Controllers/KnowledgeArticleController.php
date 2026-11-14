<?php

namespace App\Http\Controllers;

use App\Models\Ticket;
use App\Models\User;
use App\Services\ArticleHtml;
use App\Services\DepartmentAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class KnowledgeArticleController extends Controller
{
    private function manager(User $user, int $department): bool
    {
        $access = app(DepartmentAccess::class);

        return $user->isAdmin() && $access->can($user, $department, 'manageFaqs') && $access->canAccessSettings($user, $department, 'faqs');
    }

    private function editable(User $user, object $article): bool
    {
        $access = app(DepartmentAccess::class);

        return $access->can($user, (int) $article->department_id, 'faqs') && ($this->manager($user, (int) $article->department_id)
            || ($user->role === 'agent' && ((int) $article->created_by_id === $user->id || (int) $article->published_by_id === $user->id || $article->agent_editing_enabled)));
    }

    private function article(Request $request, int $id): object
    {
        $row = DB::table('knowledge_articles')->where('organization_id', $request->user()->organization_id)->where('id', $id)->first();
        abort_unless($row && app(DepartmentAccess::class)->allows($request->user(), (int) $row->department_id), 404);

        return $row;
    }

    public function index(Request $request, DepartmentAccess $access)
    {
        $user = $request->user();
        $departments = $access->departments($user)->pluck('id')->filter(fn ($id) => $access->can($user, (int) $id, 'faqs'));
        $rows = DB::table('knowledge_articles')->where('organization_id', $user->organization_id)->whereIn('department_id', $departments)->orderBy('sort_order')->orderBy('question')->get();
        $manage = $request->boolean('manage');
        if ($manage) {
            $department = (int) $request->query('department_id');
            abort_unless($department && $this->manager($user, $department), 403);
            $rows = $rows->where('department_id', $department);
        }

        return $rows->filter(fn ($row) => $manage || $row->published || $this->editable($user, $row))->map(function ($row) use ($user) {
            $category = DB::table('categories')->where('organization_id', $user->organization_id)->where('id', $row->category_id)->value('name');
            $subcategory = DB::table('subcategories')->where('organization_id', $user->organization_id)->where('id', $row->subcategory_id)->value('name');

            return ['id' => (int) $row->id, 'question' => $row->question, 'answer' => $row->answer, 'category' => $category ?? '', 'subcategory' => $subcategory ?? '', 'categoryId' => $row->category_id ? (string) $row->category_id : null, 'subcategoryId' => $row->subcategory_id ? (string) $row->subcategory_id : null, 'keywords' => $row->keywords ?? '', 'published' => (bool) $row->published, 'sortOrder' => (int) $row->sort_order, 'modified' => $row->updated_at, 'canEdit' => $this->editable($user, $row), 'agentEditingEnabled' => (bool) $row->agent_editing_enabled, 'publisherEmail' => DB::table('users')->where('organization_id', $user->organization_id)->where('id', $row->published_by_id)->value('email')];
        })->values();
    }

    public function access(Request $request, DepartmentAccess $access)
    {
        $user = $request->user();
        $department = (int) $request->query('department_id');
        $read = $department && $access->can($user, $department, 'faqs');
        $manage = $read && $this->manager($user, $department);
        $categories = $read ? DB::table('categories')->where('organization_id', $user->organization_id)->get()->filter(fn ($row) => $access->lookupAvailable($user, 'category', (int) $row->id, $department)) : collect();
        $subcategories = DB::table('subcategories')->where('organization_id', $user->organization_id)->whereIn('category_id', $categories->pluck('id'))->get();

        return ['canManage' => (bool) $manage, 'canCreate' => (bool) ($read && ($manage || $user->role === 'agent')), 'canSubmitDraft' => (bool) ($read && $access->can($user, $department, 'comment')), 'canEditArticles' => (bool) ($read && ($manage || $user->role === 'agent')), 'supportsAgentEditing' => true,
            'categoryOptions' => $categories->map(fn ($row) => ['id' => (string) $row->id, 'name' => $row->name, 'active' => (bool) $row->active])->values(),
            'subcategoryOptions' => $subcategories->map(fn ($row) => ['id' => (string) $row->id, 'name' => $row->name, 'parentId' => (string) $row->category_id, 'active' => (bool) $row->active])->values()];
    }

    public function save(Request $request, DepartmentAccess $access, ?int $id = null)
    {
        $user = $request->user();
        $org = $user->organization_id;
        $existing = $id ? $this->article($request, $id) : null;
        $input = $request->validate([
            'question' => ['required', 'string', 'max:500'], 'answer' => ['required', 'string', 'max:100000'], 'keywords' => ['nullable', 'string', 'max:2000'], 'published' => ['required', 'boolean'], 'sortOrder' => ['required', 'integer', 'min:0'],
            'department_id' => ['sometimes', 'integer', Rule::exists('departments', 'id')->where('organization_id', $org)],
            'categoryId' => ['nullable', 'integer', Rule::exists('categories', 'id')->where('organization_id', $org)],
            'subcategoryId' => ['nullable', 'integer', Rule::exists('subcategories', 'id')->where('organization_id', $org)],
            'sourceTicketId' => ['sometimes', 'integer', Rule::exists('tickets', 'id')->where('organization_id', $org)], 'agentEditingEnabled' => ['sometimes', 'boolean'],
            'organization_id' => ['prohibited'], 'created_by_id' => ['prohibited'], 'published_by_id' => ['prohibited'],
        ]);
        $source = isset($input['sourceTicketId']) ? Ticket::where('organization_id', $org)->findOrFail($input['sourceTicketId']) : null;
        if ($source) {
            Gate::authorize('view', $source);
        }
        $department = (int) ($existing?->department_id ?? $source?->department_id ?? $input['department_id'] ?? 0);
        abort_unless($department && $access->can($user, $department, 'faqs'), 403);
        $manage = $this->manager($user, $department);
        if ($existing) {
            abort_unless($this->editable($user, $existing), 403);
            abort_if(isset($input['department_id']) && $input['department_id'] !== $department, 422, 'Articles cannot move between departments.');
        } elseif (! $manage && $user->role !== 'agent') {
            abort_unless($source && ! $input['published'], 403);
            Gate::authorize('comment', $source);
        }
        abort_if(! $manage && isset($input['agentEditingEnabled']) && $input['agentEditingEnabled'] !== (bool) ($existing?->agent_editing_enabled ?? false), 403);
        $category = $input['categoryId'] ?? null;
        $subcategory = $input['subcategoryId'] ?? null;
        if ($category) {
            abort_unless($access->lookupAvailable($user, 'category', (int) $category, $department), 422);
        }
        if ($subcategory) {
            abort_unless($category && DB::table('subcategories')->where('organization_id', $org)->where('id', $subcategory)->where('category_id', $category)->exists(), 422, 'Select a subcategory belonging to this category.');
        }
        $answer = ArticleHtml::sanitize($input['answer']);
        abort_unless(trim(html_entity_decode(strip_tags($answer))) !== '', 422, 'Enter an answer.');
        $values = ['question' => $input['question'], 'answer' => $answer, 'keywords' => $input['keywords'] ?? '', 'published' => $input['published'], 'sort_order' => $input['sortOrder'], 'category_id' => $category, 'subcategory_id' => $subcategory, 'agent_editing_enabled' => $input['agentEditingEnabled'] ?? $existing?->agent_editing_enabled ?? false, 'published_by_id' => $existing?->published_by_id ?? ($input['published'] ? $user->id : null), 'updated_at' => now()];
        $saved = DB::transaction(function () use ($existing, $id, $values, $org, $department, $user, $source) {
            if ($existing) {
                DB::table('knowledge_articles')->where('organization_id', $org)->where('id', $id)->update($values);
            } else {
                $id = DB::table('knowledge_articles')->insertGetId([...$values, 'organization_id' => $org, 'department_id' => $department, 'created_by_id' => $user->id, 'source_ticket_id' => $source?->id, 'created_at' => now()]);
            }
            $this->audit($user, $id, 'knowledge.article.saved');

            return $id;
        });

        return response()->json(['id' => (int) $saved], $existing ? 200 : 201);
    }

    public function destroy(Request $request, int $id)
    {
        $row = $this->article($request, $id);
        abort_unless($this->manager($request->user(), (int) $row->department_id), 403);
        DB::transaction(function () use ($request, $id) {
            DB::table('knowledge_articles')->where('organization_id', $request->user()->organization_id)->where('id', $id)->delete();
            $this->audit($request->user(), $id, 'knowledge.article.deleted');
        });

        return response()->noContent();
    }

    private function audit(User $user, int $id, string $action): void
    {
        DB::table('audit_events')->insert(['organization_id' => $user->organization_id, 'user_id' => $user->id, 'action' => $action, 'changes' => json_encode(['article_id' => $id], JSON_THROW_ON_ERROR), 'created_at' => now()]);
    }
}
