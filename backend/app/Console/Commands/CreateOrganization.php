<?php

namespace App\Console\Commands;

use App\Services\OrganizationLifecycle;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;

class CreateOrganization extends Command
{
    protected $signature = 'helpdesk:organization-create {slug} {name} {entra_tenant_id} {--client-id=*} {--expires-at=} {--actor=}';

    protected $description = 'Deployment owner: onboard an approved organization and its trusted Entra clients';

    public function handle(OrganizationLifecycle $lifecycle): int
    {
        $input = ['slug' => $this->argument('slug'), 'name' => $this->argument('name'), 'entra_tenant_id' => strtolower($this->argument('entra_tenant_id')), 'allowed_client_ids' => array_values(array_unique(array_map('strtolower', $this->option('client-id')))), 'access_expires_at' => $this->option('expires-at'), 'actor' => $this->option('actor')];
        Validator::make($input, ['slug' => ['required', 'string', 'max:100', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/', 'unique:organizations,slug'], 'name' => 'required|string|max:255', 'entra_tenant_id' => 'required|uuid|unique:organizations,entra_tenant_id', 'allowed_client_ids' => 'required|array|min:1', 'allowed_client_ids.*' => 'required|uuid', 'access_expires_at' => 'nullable|date', 'actor' => 'required|string|max:255'])->validate();
        $actor = $input['actor'];
        unset($input['actor']);
        $organization = $lifecycle->create([...$input, 'status' => 'active'], $actor);
        $this->info("Organization {$organization->slug} created. Bootstrap its first administrator next.");

        return self::SUCCESS;
    }
}
