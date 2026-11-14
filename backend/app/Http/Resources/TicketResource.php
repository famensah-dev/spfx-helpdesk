<?php

namespace App\Http\Resources;

use App\Models\User;
use App\Services\DepartmentAccess;
use Illuminate\Http\Resources\Json\JsonResource;

class TicketResource extends JsonResource
{
    public static function person(?User $user): ?array
    {
        return $user ? ['Id' => $user->id, 'AadId' => $user->entra_object_id, 'Title' => $user->name, 'Email' => $user->email] : null;
    }

    public function toArray($request): array
    {
        return [
            'RoleRules' => app(DepartmentAccess::class)->rules($request->user(), $this->department_id),
            'Id' => $this->id, 'Title' => $this->title, 'Description' => $this->description ?? '',
            'Department' => $this->department?->name, 'DepartmentId' => $this->department_id,
            'Category' => $this->category?->name, 'CategoryId' => $this->category_id,
            'Subcategory' => $this->subcategory?->name, 'SubcategoryId' => $this->subcategory_id,
            'IssueType' => $this->issueType?->name, 'IssueTypeId' => $this->issue_type_id,
            'TicketType' => $this->ticket_type, 'TicketSource' => $this->ticket_source,
            'Status' => $this->status, 'Priority' => $this->priority, 'Archived' => $this->archived,
            'Created' => $this->created_at->toISOString(), 'Modified' => $this->updated_at->toISOString(),
            'AssignedTo' => self::person($this->assignee), 'Requester' => self::person($this->requester),
            'CreatedBy' => self::person($this->creator ?? $this->requester), 'ResolutionSummary' => $this->resolution_summary,
            'ResolvedAt' => $this->resolved_at?->toISOString(), 'FirstRespondedAt' => $this->first_responded_at?->toISOString(),
            'DueDate' => $this->due_date?->toISOString(), 'HasResponseTracking' => true, 'HasResolutionTracking' => true,
        ];
    }
}
