<?php

namespace App\Models;

use App\Services\DepartmentAccess;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class Ticket extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['organization_id' => 'integer', 'department_id' => 'integer', 'created_by_id' => 'integer', 'category_id' => 'integer', 'subcategory_id' => 'integer', 'issue_type_id' => 'integer', 'requester_id' => 'integer', 'assigned_to_id' => 'integer', 'archived' => 'boolean', 'resolved_at' => 'datetime', 'first_responded_at' => 'datetime', 'due_date' => 'datetime'];
    }

    public function scopeVisibleTo(Builder $query, User $user): void
    {
        $query->where('organization_id', $user->organization_id)->whereNotNull('organization_id');
        if ($user->role !== 'superAdmin') {
            $access = app(DepartmentAccess::class);
            $query->where(function (Builder $query) use ($user, $access) {
                $query->whereRaw('1 = 0');
                foreach ($access->departments($user)->get() as $department) {
                    $rules = $access->rules($user, $department->id);
                    if (! array_intersect(['tickets', 'dashboard'], $rules['actions'])) {
                        continue;
                    }
                    $query->orWhere(function (Builder $query) use ($user, $department, $rules) {
                        $query->where('department_id', $department->id);
                        match ($rules['scope']) {
                            'all' => null,
                            'assigned' => $query->where('assigned_to_id', $user->id),
                            'assignedOrCreated' => $query->where(fn ($q) => $q->where('assigned_to_id', $user->id)->orWhere('created_by_id', $user->id)),
                            'newUnassigned' => $query->where('status', 'New')->whereNull('assigned_to_id'),
                            default => $query->where(fn ($q) => $q->where('requester_id', $user->id)->orWhere('created_by_id', $user->id)),
                        };
                    });
                }
            });
        }
    }

    public function resolveRouteBindingQuery($query, $value, $field = null)
    {
        // AuthenticateEntra runs before SubstituteBindings; no client-supplied org ID.
        return parent::resolveRouteBindingQuery($query, $value, $field)
            ->where('organization_id', request()->user()?->organization_id)->whereNotNull('organization_id');
    }

    public function requester()
    {
        return $this->belongsTo(User::class, 'requester_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    public function department()
    {
        return $this->belongsTo(Department::class);
    }

    public function assignee()
    {
        return $this->belongsTo(User::class, 'assigned_to_id');
    }

    public function category()
    {
        return $this->belongsTo(Category::class);
    }

    public function subcategory()
    {
        return $this->belongsTo(Subcategory::class);
    }

    public function issueType()
    {
        return $this->belongsTo(IssueType::class);
    }
}
