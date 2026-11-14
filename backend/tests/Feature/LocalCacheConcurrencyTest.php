<?php

namespace Tests\Feature;

use Illuminate\Cache\RateLimiter;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use PDO;
use Tests\TestCase;

class LocalCacheConcurrencyTest extends TestCase
{
    public function test_request_counter_does_not_need_sqlite_write_lock_with_local_file_cache(): void
    {
        $root = storage_path('framework/testing');
        $directory = $root.'/cache-concurrency-'.Str::uuid();
        File::ensureDirectoryExists($directory);
        $database = $directory.'/test.sqlite';
        file_put_contents($database, '');
        config([
            'database.default' => 'sqlite',
            'database.connections.sqlite.database' => $database,
            'database.connections.sqlite.busy_timeout' => 100,
            'database.connections.sqlite.journal_mode' => 'WAL',
            'cache.default' => 'file',
            'cache.stores.file.path' => $directory.'/cache',
            'cache.stores.file.lock_path' => $directory.'/cache',
        ]);
        DB::purge('sqlite');
        $this->app->forgetInstance('cache.store');
        $this->app->forgetInstance(RateLimiter::class);
        $writer = null;
        try {
            Schema::create('cache', function (Blueprint $table) {
                $table->string('key')->primary();
                $table->text('value');
                $table->integer('expiration');
            });
            $writer = new PDO('sqlite:'.$database, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $writer->beginTransaction();
            $writer->exec("INSERT INTO cache VALUES ('held-write', 'test', 0)");
            // Another connection owns SQLite's write lock. Request throttling must still work.
            $this->getJson('/api/v1/session')->assertUnauthorized();
            $this->assertNotEmpty(File::allFiles($directory.'/cache'));
            $this->assertSame(1, (int) $writer->query('SELECT COUNT(*) FROM cache')->fetchColumn());
        } finally {
            if ($writer?->inTransaction()) {
                $writer->rollBack();
            }
            $writer = null;
            DB::purge('sqlite');
            $resolved = realpath($directory);
            if ($resolved && str_starts_with($resolved, realpath($root).DIRECTORY_SEPARATOR)) {
                File::deleteDirectory($resolved);
            }
        }
    }
}
