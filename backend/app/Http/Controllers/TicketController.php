<?php

namespace App\Http\Controllers;

use App\Http\Requests\SaveTicketRequest;
use App\Http\Resources\TicketResource;
use App\Models\Ticket;
use App\Services\DepartmentAccess;
use App\Services\TicketWorkflow;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class TicketController extends Controller
{
    public function index(Request $request)
    {
        $request->validate(['after' => ['nullable', 'integer', 'min:0']]);
        $tickets = Ticket::visibleTo($request->user())->with(['requester', 'creator', 'assignee', 'department', 'category', 'subcategory', 'issueType'])
            ->where('id', '>', $request->integer('after'))->orderBy('id')->limit(201)->get();
        $more = $tickets->count() > 200;
        $tickets = $tickets->take(200);

        return response()->json(['tickets' => TicketResource::collection($tickets), 'next' => $more ? $tickets->last()->id : null]);
    }

    public function store(SaveTicketRequest $request, TicketWorkflow $workflow)
    {
        $ticket = $workflow->create($request->user(), $request->validated());

        return (new TicketResource($ticket->load(['requester', 'creator', 'assignee', 'department', 'category', 'subcategory', 'issueType'])))->response()->setStatusCode(201);
    }

    public function update(SaveTicketRequest $request, Ticket $ticket, TicketWorkflow $workflow)
    {
        $workflow->update($request->user(), $ticket, $request->validated());

        return response()->noContent();
    }

    public function comments(Request $request, Ticket $ticket)
    {
        Gate::authorize('view', $ticket);

        return DB::table('ticket_comments')->join('users', 'users.id', '=', 'ticket_comments.user_id')
            ->where('ticket_comments.organization_id', $ticket->organization_id)->where('ticket_id', $ticket->id)->orderBy('ticket_comments.id')
            ->get(['ticket_comments.id', 'ticket_comments.user_id', 'text', 'users.name as author', 'ticket_comments.created_at as created'])
            ->map(function ($row) use ($request, $ticket) {
                $created = Carbon::parse($row->created);

                return ['id' => (string) $row->id, 'text' => $row->text, 'author' => $row->author, 'created' => $created->toISOString(), 'canDelete' => (int) $row->user_id === $request->user()->id && $created->lte(now()) && $created->gt(now()->subMinutes(10)) && app(DepartmentAccess::class)->can($request->user(), $ticket->department_id, 'comment')];
            });
    }

    public function deleteComment(Request $request, Ticket $ticket, int $comment, TicketWorkflow $workflow)
    {
        Gate::authorize('comment', $ticket);
        DB::transaction(function () use ($request, $ticket, $comment, $workflow) {
            $row = DB::table('ticket_comments')->where('organization_id', $ticket->organization_id)->where('ticket_id', $ticket->id)->where('id', $comment)->lockForUpdate()->first();
            abort_unless($row, 404);
            abort_unless((int) $row->user_id === $request->user()->id, 403, 'Only the author can delete this comment.');
            $created = Carbon::parse($row->created_at);
            abort_unless($created->lte(now()) && $created->gt(now()->subMinutes(10)), 403, 'The 10-minute deletion window has expired.');
            DB::table('ticket_comments')->where('organization_id', $ticket->organization_id)->where('ticket_id', $ticket->id)->where('id', $comment)->delete();
            $workflow->audit($request->user(), $ticket, 'comment.deleted', ['comment_id' => $comment]);
        });

        return response()->noContent();
    }

    public function addComment(Request $request, Ticket $ticket, TicketWorkflow $workflow)
    {
        Gate::authorize('comment', $ticket);
        $input = $request->validate(['text' => ['required', 'string', 'max:20000']]);
        DB::transaction(function () use ($request, $ticket, $workflow, $input) {
            DB::table('ticket_comments')->insert(['organization_id' => $ticket->organization_id, 'ticket_id' => $ticket->id, 'user_id' => $request->user()->id, 'text' => $input['text'], 'created_at' => now(), 'updated_at' => now()]);
            $workflow->audit($request->user(), $ticket, 'comment.created', []);
        });

        return response()->noContent();
    }

    public function history(Ticket $ticket)
    {
        Gate::authorize('view', $ticket);

        return DB::table('audit_events')->join('users', 'users.id', '=', 'audit_events.user_id')
            ->where('audit_events.organization_id', $ticket->organization_id)->where('ticket_id', $ticket->id)->orderByDesc('audit_events.id')
            ->get(['audit_events.id', 'audit_events.created_at as modified', 'users.name as author', 'action']);
    }

    public function response(Request $request, Ticket $ticket, TicketWorkflow $workflow)
    {
        Gate::authorize('update', $ticket);
        abort_unless(app(DepartmentAccess::class)->can($request->user(), $ticket->department_id, 'status'), 403);
        if ($request->user()->role === 'agent' && in_array(app(DepartmentAccess::class)->rules($request->user(), $ticket->department_id)['scope'], ['assigned', 'assignedOrCreated'], true)) {
            abort_unless($ticket->assigned_to_id === $request->user()->id, 403);
        }
        DB::transaction(function () use ($request, $ticket, $workflow) {
            $changed = Ticket::where('organization_id', $request->user()->organization_id)->whereKey($ticket->id)->whereNull('first_responded_at')->update(['first_responded_at' => now()]);
            if ($changed) {
                $workflow->audit($request->user(), $ticket, 'ticket.first_response', []);
            }
        });

        return response()->noContent();
    }
}
