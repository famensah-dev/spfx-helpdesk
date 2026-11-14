<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organizations', function (Blueprint $table) {
            $table->id();
            $table->string('slug')->unique();
            $table->string('name');
            $table->uuid('entra_tenant_id')->nullable()->unique();
            $table->json('allowed_client_ids');
            $table->string('status')->default('trial');
            $table->timestamp('access_expires_at')->nullable();
            $table->timestamps();
            $table->unique(['id', 'entra_tenant_id']);
        });
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('organization_id')->nullable()->constrained();
            $table->dropUnique(['email']);
            $table->string('password')->nullable()->change();
            $table->uuid('tenant_id')->nullable();
            $table->uuid('entra_object_id')->nullable();
            $table->string('role')->default('requester');
            $table->boolean('enabled')->default(false);
            $table->unique(['tenant_id', 'entra_object_id']);
            $table->unique(['organization_id', 'email']);
            $table->unique(['organization_id', 'id']);
            $table->foreign(['organization_id', 'tenant_id'])->references(['id', 'entra_tenant_id'])->on('organizations');
        });
        Schema::create('departments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained();
            $table->string('name');
            $table->boolean('active')->default(true);
            $table->json('role_settings')->nullable();
            $table->timestamps();
            $table->unique(['organization_id', 'id']);
            $table->unique(['organization_id', 'name']);
        });
        Schema::create('user_entra_group_cache', function (Blueprint $table) {
            $table->foreignId('organization_id')->constrained();
            $table->foreignId('user_id');
            $table->uuid('entra_group_id');
            $table->timestamp('expires_at');
            $table->primary(['user_id', 'entra_group_id']);
            $table->foreign(['organization_id', 'user_id'])->references(['organization_id', 'id'])->on('users');
        });
        Schema::create('department_memberships', function (Blueprint $table) {
            $table->foreignId('organization_id')->constrained();
            $table->foreignId('department_id');
            $table->foreignId('user_id');
            $table->primary(['department_id', 'user_id']);
            $table->foreign(['organization_id', 'department_id'])->references(['organization_id', 'id'])->on('departments');
            $table->foreign(['organization_id', 'user_id'])->references(['organization_id', 'id'])->on('users');
        });
        Schema::create('department_entra_groups', function (Blueprint $table) {
            $table->foreignId('organization_id')->constrained();
            $table->foreignId('department_id');
            $table->uuid('entra_group_id');
            $table->primary(['department_id', 'entra_group_id']);
            $table->foreign(['organization_id', 'department_id'])->references(['organization_id', 'id'])->on('departments');
        });
        foreach (['categories', 'issue_types'] as $name) {
            Schema::create($name, function (Blueprint $table) {
                $table->id();
                $table->foreignId('organization_id')->constrained();
                $table->string('name');
                $table->boolean('active')->default(true);
                $table->integer('sort_order')->default(0);
                $table->timestamps();
                $table->unique(['organization_id', 'id']);
                $table->unique(['organization_id', 'name']);
            });
        }
        foreach (['category_departments' => 'category_id', 'issue_type_departments' => 'issue_type_id'] as $name => $column) {
            Schema::create($name, function (Blueprint $table) use ($column) {
                $table->foreignId('organization_id')->constrained();
                $table->foreignId('department_id');
                $table->foreignId($column);
                $table->primary([$column, 'department_id']);
                $table->foreign(['organization_id', 'department_id'])->references(['organization_id', 'id'])->on('departments');
                $table->foreign(['organization_id', $column])->references(['organization_id', 'id'])->on($column === 'category_id' ? 'categories' : 'issue_types');
            });
        }
        Schema::create('subcategories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained();
            $table->foreignId('category_id');
            $table->string('name');
            $table->boolean('active')->default(true);
            $table->integer('sort_order')->default(0);
            $table->timestamps();
            $table->unique(['organization_id', 'id']);
            $table->unique(['organization_id', 'category_id', 'id']);
            $table->unique(['organization_id', 'category_id', 'name']);
            $table->foreign(['organization_id', 'category_id'])->references(['organization_id', 'id'])->on('categories');
        });
        Schema::create('tickets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained();
            $table->string('title');
            $table->foreignId('department_id')->nullable();
            $table->foreignId('created_by_id')->nullable();
            $table->text('description')->nullable();
            $table->foreignId('category_id')->nullable();
            $table->foreignId('subcategory_id')->nullable();
            $table->foreignId('issue_type_id')->nullable();
            $table->string('status')->default('New');
            $table->string('priority');
            $table->foreignId('requester_id')->constrained('users');
            $table->foreignId('assigned_to_id')->nullable()->constrained('users');
            $table->boolean('archived')->default(false);
            $table->text('resolution_summary')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamp('first_responded_at')->nullable();
            $table->timestamp('due_date')->nullable();
            $table->timestamps();
            $table->index(['requester_id', 'id']);
            $table->index(['assigned_to_id', 'id']);
            $table->unique(['organization_id', 'id']);
            $table->foreign(['organization_id', 'department_id'])->references(['organization_id', 'id'])->on('departments');
            $table->foreign(['organization_id', 'created_by_id'])->references(['organization_id', 'id'])->on('users');
            $table->foreign(['organization_id', 'category_id'])->references(['organization_id', 'id'])->on('categories');
            $table->foreign(['organization_id', 'subcategory_id'])->references(['organization_id', 'id'])->on('subcategories');
            $table->foreign(['organization_id', 'category_id', 'subcategory_id'], 'tickets_subcategory_parent_fk')->references(['organization_id', 'category_id', 'id'])->on('subcategories');
            $table->foreign(['organization_id', 'issue_type_id'])->references(['organization_id', 'id'])->on('issue_types');
            $table->foreign(['organization_id', 'requester_id'])->references(['organization_id', 'id'])->on('users');
            $table->foreign(['organization_id', 'assigned_to_id'])->references(['organization_id', 'id'])->on('users');
        });
        Schema::create('ticket_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained();
            $table->foreignId('ticket_id')->constrained();
            $table->foreignId('user_id')->constrained('users');
            $table->text('text');
            $table->timestamps();
            $table->foreign(['organization_id', 'ticket_id'])->references(['organization_id', 'id'])->on('tickets');
            $table->foreign(['organization_id', 'user_id'])->references(['organization_id', 'id'])->on('users');
        });
        Schema::create('audit_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained();
            $table->foreignId('user_id')->nullable()->constrained('users');
            $table->foreignId('ticket_id')->nullable()->constrained();
            $table->string('action');
            $table->json('changes');
            $table->timestamp('created_at')->useCurrent();
            $table->foreign(['organization_id', 'ticket_id'])->references(['organization_id', 'id'])->on('tickets');
            $table->foreign(['organization_id', 'user_id'])->references(['organization_id', 'id'])->on('users');
        });
        Schema::create('organization_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained();
            $table->string('actor');
            $table->string('action');
            $table->text('reason');
            $table->json('changes');
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        if (DB::table('users')->whereNull('password')->exists()) {
            throw new RuntimeException('Remove accounts without passwords before restoring the original required-password schema.');
        }
        if (DB::table('users')->select('email')->groupBy('email')->havingRaw('COUNT(*) > 1')->exists()) {
            throw new RuntimeException('Resolve organization-scoped duplicate emails before restoring globally unique email addresses.');
        }
        Schema::dropIfExists('organization_events');
        Schema::dropIfExists('audit_events');
        Schema::dropIfExists('ticket_comments');
        Schema::dropIfExists('tickets');
        Schema::dropIfExists('subcategories');
        Schema::dropIfExists('category_departments');
        Schema::dropIfExists('issue_type_departments');
        Schema::dropIfExists('categories');
        Schema::dropIfExists('issue_types');
        Schema::dropIfExists('department_entra_groups');
        Schema::dropIfExists('department_memberships');
        Schema::dropIfExists('user_entra_group_cache');
        Schema::dropIfExists('departments');
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['organization_id', 'tenant_id']);
            $table->dropForeign(['organization_id']);
            $table->dropUnique(['organization_id', 'email']);
            $table->dropUnique(['organization_id', 'id']);
            $table->dropUnique(['tenant_id', 'entra_object_id']);
            $table->dropColumn(['organization_id', 'tenant_id', 'entra_object_id', 'role', 'enabled']);
            $table->unique('email');
            $table->string('password')->nullable(false)->change();
        });
        Schema::dropIfExists('organizations');
    }
};
