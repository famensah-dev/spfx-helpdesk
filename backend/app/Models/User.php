<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;

class User extends Authenticatable
{
    private ?array $verifiedEntraGroupIds = null;

    public function setVerifiedEntraGroupIds(array $groups): void
    {
        $this->verifiedEntraGroupIds = $groups;
    }

    public function verifiedEntraGroupIds(): array
    {
        // For other users (for example assignee validation), use only unexpired verified evidence.
        return $this->verifiedEntraGroupIds ?? DB::table('user_entra_group_cache')->where('organization_id', $this->organization_id)->where('user_id', $this->id)->where('expires_at', '>', now())->pluck('entra_group_id')->all();
    }

    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'organization_id',
        'tenant_id',
        'entra_object_id',
        'role',
        'enabled',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
        'tenant_id',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'enabled' => 'boolean',
            'organization_id' => 'integer',
        ];
    }

    public function isAdmin(): bool
    {
        return in_array($this->role, ['admin', 'superAdmin'], true);
    }

    public function organization()
    {
        return $this->belongsTo(Organization::class);
    }

    public function hasOrganizationAccess(): bool
    {
        return $this->enabled && $this->organization_id !== null
            && (Organization::forDeployment()->find($this->organization_id)?->allowsAccess() ?? false);
    }
}
