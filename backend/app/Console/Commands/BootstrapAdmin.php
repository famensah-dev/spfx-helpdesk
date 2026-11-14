<?php

namespace App\Console\Commands;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class BootstrapAdmin extends Command
{
    protected $signature = 'helpdesk:bootstrap-admin {organization} {entra_object_id} {email} {name}';

    protected $description = 'Create the first workspace administrator using their Entra object ID';

    public function handle(): int
    {
        $organization = Organization::where('slug', $this->argument('organization'))->firstOrFail();
        $input = ['entra_object_id' => strtolower($this->argument('entra_object_id')), 'email' => $this->argument('email'), 'name' => $this->argument('name'), 'tenant_id' => $organization->entra_tenant_id, 'organization_id' => $organization->id];
        Validator::make($input, ['entra_object_id' => 'required|uuid', 'email' => 'required|email|max:255', 'name' => 'required|string|max:255', 'tenant_id' => 'required|uuid'])->validate();

        return DB::transaction(function () use ($input, $organization) {
            Organization::whereKey($organization->id)->lockForUpdate()->firstOrFail();
            if (User::where('organization_id', $organization->id)->exists()) {
                $this->error('This organization already has users. Use its protected users API.');

                return self::FAILURE;
            }
            $user = User::create([...$input, 'role' => 'superAdmin', 'enabled' => true]);
            DB::table('audit_events')->insert(['organization_id' => $organization->id, 'user_id' => $user->id, 'action' => 'user.bootstrap', 'changes' => '{}', 'created_at' => now()]);
            $this->info('Organization administrator created.');

            return self::SUCCESS;
        });
    }
}
