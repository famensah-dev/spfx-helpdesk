<?php

namespace App\Policies;

use App\Models\Ticket;
use App\Models\User;
use App\Services\DepartmentAccess;

class TicketPolicy
{
    public function view(User $user, Ticket $ticket): bool
    {
        return $user->hasOrganizationAccess() && Ticket::visibleTo($user)->whereKey($ticket->id)->exists();
    }

    public function update(User $user, Ticket $ticket): bool
    {
        return $this->view($user, $ticket) && $user->role !== 'requester';
    }

    public function comment(User $user, Ticket $ticket): bool
    {
        return $this->view($user, $ticket) && app(DepartmentAccess::class)->can($user, $ticket->department_id, 'comment');
    }
}
