<?php

namespace App\Console\Commands;

use App\Services\OrganizationLifecycle;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class ManageOrganization extends Command
{
    protected $signature = 'helpdesk:organization-access {slug} {--status=} {--expires-at=} {--no-expiry} {--client-id=*} {--actor=} {--reason=}';

    protected $description = 'Deployment owner: suspend, restore, expire or update trusted clients for an organization';

    public function handle(OrganizationLifecycle $lifecycle): int
    {
        $changes = [];
        if ($this->option('status') !== null) {
            $changes['status'] = $this->option('status');
        }
        if ($this->option('expires-at') !== null) {
            $changes['access_expires_at'] = $this->option('expires-at');
        }
        if ($this->option('no-expiry')) {
            $changes['access_expires_at'] = null;
        }
        if ($this->option('client-id')) {
            $changes['allowed_client_ids'] = array_values(array_unique(array_map('strtolower', $this->option('client-id'))));
        }
        if (! $changes || ($this->option('no-expiry') && $this->option('expires-at') !== null)) {
            $this->error('Supply at least one change. Use either --expires-at or --no-expiry.');

            return self::FAILURE;
        }
        Validator::make([...$changes, 'slug' => $this->argument('slug'), 'actor' => $this->option('actor'), 'reason' => $this->option('reason')], ['slug' => 'required|exists:organizations,slug', 'status' => ['sometimes', Rule::in(['trial', 'active', 'suspended', 'cancelled'])], 'access_expires_at' => 'sometimes|nullable|date', 'allowed_client_ids' => 'sometimes|required|array|min:1', 'allowed_client_ids.*' => 'required|uuid', 'actor' => 'required|string|max:255', 'reason' => 'required|string|max:4000'])->validate();
        $lifecycle->update($this->argument('slug'), $changes, $this->option('actor'), $this->option('reason'));
        $this->info('Organization access updated. Changes apply to subsequent requests; data is retained.');

        return self::SUCCESS;
    }
}
