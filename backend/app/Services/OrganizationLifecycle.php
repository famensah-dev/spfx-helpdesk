<?php

namespace App\Services;

use App\Models\Organization;
use Illuminate\Support\Facades\DB;

/** Called only by deployment-owner console commands, never customer APIs. */
class OrganizationLifecycle
{
    public function create(array $attributes, string $actor): Organization
    {
        return DB::transaction(function () use ($attributes, $actor) {
            $organization = Organization::create($attributes);
            $this->audit($organization, $actor, 'organization.created', 'Organization onboarded', $attributes);

            return $organization;
        });
    }

    public function update(string $slug, array $changes, string $actor, string $reason): void
    {
        DB::transaction(function () use ($slug, $changes, $actor, $reason) {
            $organization = Organization::where('slug', $slug)->lockForUpdate()->firstOrFail();
            $before = $organization->only(array_keys($changes));
            $organization->fill($changes)->save();
            $this->audit($organization, $actor, 'organization.updated', $reason, ['before' => $before, 'after' => $organization->only(array_keys($changes))]);
        });
    }

    private function audit(Organization $organization, string $actor, string $action, string $reason, array $changes): void
    {
        DB::table('organization_events')->insert(['organization_id' => $organization->id, 'actor' => $actor, 'action' => $action, 'reason' => $reason, 'changes' => json_encode($changes, JSON_THROW_ON_ERROR), 'created_at' => now()]);
    }
}
