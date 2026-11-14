<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'sqlsrv') {
            return;
        }

        // SQL Server otherwise allows only one NULL identity per unique index.
        // These indexes are not FK targets; composite organization FKs remain intact.
        Schema::table('organizations', fn (Blueprint $table) => $table->dropUnique(['entra_tenant_id']));
        DB::statement('CREATE UNIQUE INDEX [organizations_entra_tenant_id_unique] ON [organizations] ([entra_tenant_id]) WHERE [entra_tenant_id] IS NOT NULL');
        Schema::table('users', fn (Blueprint $table) => $table->dropUnique(['tenant_id', 'entra_object_id']));
        DB::statement('CREATE UNIQUE INDEX [users_tenant_id_entra_object_id_unique] ON [users] ([tenant_id], [entra_object_id]) WHERE [tenant_id] IS NOT NULL AND [entra_object_id] IS NOT NULL');
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'sqlsrv') {
            return;
        }
        if (DB::table('organizations')->whereNull('entra_tenant_id')->count() > 1
            || DB::table('users')->select('tenant_id', 'entra_object_id')->groupBy('tenant_id', 'entra_object_id')->havingRaw('COUNT(*) > 1')->exists()) {
            throw new RuntimeException('Resolve duplicate NULL identity combinations before restoring unfiltered SQL Server indexes.');
        }
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['tenant_id', 'entra_object_id']);
            $table->unique(['tenant_id', 'entra_object_id']);
        });
        Schema::table('organizations', function (Blueprint $table) {
            $table->dropUnique(['entra_tenant_id']);
            $table->unique('entra_tenant_id');
        });
    }
};
