<?php

namespace App\Http\Middleware;

use App\Models\Organization;
use App\Models\User;
use App\Services\EntraTokenValidator;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class AuthenticateEntra
{
    public function handle(Request $request, Closure $next)
    {
        abort_unless($request->bearerToken(), 401, 'An API access token is required.');
        try {
            $identity = app(EntraTokenValidator::class)->validate($request->bearerToken());
        } catch (\UnexpectedValueException|\DomainException $exception) {
            abort(401, 'Invalid or expired API access token.');
        }
        // Identity is established by Entra; roles are read from our database on every request.
        $organization = Organization::forDeployment()->where('entra_tenant_id', $identity->tenant_id)->first();
        abort_unless($organization && $organization->allowsAccess(), 403, 'Organization access is unavailable. Contact your administrator.');
        $user = User::where('organization_id', $organization->id)->where('tenant_id', $identity->tenant_id)->where('entra_object_id', $identity->entra_object_id)->where('enabled', true)->first();
        abort_unless($user, 403, 'You do not have access to this DeskPilot workspace.');
        $user->setVerifiedEntraGroupIds($identity->entra_group_ids ?? []);
        $cachedGroups = isset($identity->group_claims_expires_at)
            ? DB::table('user_entra_group_cache')->where('organization_id', $user->organization_id)->where('user_id', $user->id)->get(['entra_group_id', 'expires_at']) : collect();
        $cacheMatches = $cachedGroups->count() === count($identity->entra_group_ids ?? []) && $cachedGroups->every(fn ($row) => in_array($row->entra_group_id, $identity->entra_group_ids ?? [], true) && Carbon::parse($row->expires_at, 'UTC')->timestamp === ($identity->group_claims_expires_at ?? null));
        if (isset($identity->group_claims_expires_at) && ! $cacheMatches) {
            DB::transaction(function () use ($user, $identity) {
                // Serialize refreshes for the same account; cached evidence never outlives its token.
                User::whereKey($user->id)->lockForUpdate()->first();
                DB::table('user_entra_group_cache')->where('organization_id', $user->organization_id)->where('user_id', $user->id)->delete();
                foreach ($identity->entra_group_ids as $group) {
                    DB::table('user_entra_group_cache')->insert(['organization_id' => $user->organization_id, 'user_id' => $user->id, 'entra_group_id' => $group, 'expires_at' => Carbon::createFromTimestampUTC($identity->group_claims_expires_at)]);
                }
            });
        }
        Auth::setUser($user);
        $user->setRelation('organization', $organization);
        $request->setUserResolver(fn () => $user);

        return $next($request);
    }
}
