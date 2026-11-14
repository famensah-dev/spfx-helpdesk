<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class Organization extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['allowed_client_ids' => 'array', 'access_expires_at' => 'datetime'];
    }

    public function scopeForDeployment(Builder $query): void
    {
        if (config('helpdesk.deployment_mode') === 'shared') {
            return;
        }
        if (config('helpdesk.deployment_mode') === 'dedicated' && config('helpdesk.organization_slug')) {
            $query->where('slug', config('helpdesk.organization_slug'));
        } else {
            $query->whereRaw('1 = 0');
        }
    }

    public function allowsAccess(): bool
    {
        return in_array($this->status, ['active', 'trial'], true)
            && ($this->access_expires_at === null || $this->access_expires_at->isFuture());
    }
}
