<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SaveTicketRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $required = $this->isMethod('post') ? 'required' : 'sometimes';

        return [
            'title' => [$required, 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:50000'],
            'category' => ['sometimes', 'nullable', 'integer'],
            'subcategory' => ['sometimes', 'nullable', 'integer'],
            'issueType' => ['sometimes', 'nullable', 'integer'],
            'departmentId' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'ticketType' => ['sometimes', 'nullable', Rule::in(['Problem', 'Incident', 'Question', 'Request'])],
            'ticketSource' => ['sometimes', 'nullable', Rule::in(['DeskPilot', 'Email', 'Forms', 'Phone / Call-in', 'Other'])],
            'priority' => [$required, Rule::in(['Low', 'Medium', 'High', 'Critical'])],
            'status' => ['sometimes', Rule::in(['New', 'Assigned', 'In Progress', 'On Hold', 'Waiting on Third Party', 'Resolved', 'Closed', 'Completed', 'Pending', 'Escalated'])],
            'assignedToId' => ['sometimes', 'nullable', 'integer', Rule::exists('users', 'id')->where(fn ($query) => $query->where('organization_id', $this->user()->organization_id)->where('enabled', true)->whereIn('role', ['agent', 'admin', 'superAdmin']))],
            'resolutionSummary' => ['sometimes', 'nullable', 'string', 'max:20000'],
            'dueDate' => ['sometimes', 'nullable', 'date'],
            'archived' => ['sometimes', 'boolean'],
            // Requester identity always comes from the authenticated principal.
            'requesterEmail' => ['prohibited'],
            'requesterName' => ['prohibited'],
            'requestedById' => ['prohibited'],
            'requester_id' => ['prohibited'],
            'created_by_id' => ['prohibited'],
            'organization_id' => ['prohibited'],
            'tenant_id' => ['prohibited'],
        ];
    }
}
