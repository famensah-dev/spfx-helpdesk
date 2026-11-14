<?php

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

// Rebuild only this workspace's local SQLite schema, preserving its records.
// Azure and other database drivers are deliberately unsupported.
require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$kernel = $app->make(Kernel::class);
$kernel->bootstrap();
$expected = realpath(__DIR__.'/../database/database.sqlite');
$configured = config('database.connections.sqlite.database');
if (config('database.default') !== 'sqlite' || ! $expected || realpath($configured) !== $expected || app()->environment('production')) {
    throw new RuntimeException('This tool only supports the local development database/database.sqlite.');
}
$dryRun = in_array('--dry-run', $argv, true);
$directory = storage_path('app/private/setup-backups');
if (! is_dir($directory) && ! mkdir($directory, 0700, true)) {
    throw new RuntimeException('Cannot create private backup directory.');
}
$stamp = gmdate('Ymd-His').'-'.bin2hex(random_bytes(3));
$backup = $directory.'/database-before-schema-upgrade-'.$stamp.'.sqlite';
$rebuilt = $directory.'/database-rebuilt-'.$stamp.'.sqlite';
$maintenanceAlreadyActive = app()->isDownForMaintenance();
$quote = fn (string $name) => '"'.str_replace('"', '""', $name).'"';
$tables = fn (PDO $pdo) => $pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")->fetchAll(PDO::FETCH_COLUMN);
$count = fn (PDO $pdo, string $table) => (int) $pdo->query('SELECT COUNT(*) FROM '.$quote($table))->fetchColumn();
$local = new PDO('sqlite:'.$expected, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$local->exec('PRAGMA busy_timeout = 15000');
try {
    if (! $maintenanceAlreadyActive) {
        $kernel->call('down');
    }
    // VACUUM INTO produces a consistent snapshot, including databases using WAL.
    $local->exec('VACUUM INTO '.$local->quote($backup));
    $old = new PDO('sqlite:'.$backup, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    file_put_contents($rebuilt, '');
    config(['database.connections.local_rebuild' => [...config('database.connections.sqlite'), 'database' => $rebuilt]]);
    if ($kernel->call('migrate', ['--database' => 'local_rebuild', '--force' => true]) !== 0) {
        throw new RuntimeException('Temporary schema creation failed; live database unchanged.');
    }
    DB::purge('local_rebuild');
    $new = new PDO('sqlite:'.$rebuilt, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $new->exec('PRAGMA foreign_keys = OFF');
    $newTables = $tables($new);
    $oldTables = $tables($old);
    if (array_diff($oldTables, $newTables)) {
        throw new RuntimeException('Unknown local tables exist; refusing to discard them.');
    }
    $new->beginTransaction();
    foreach ($oldTables as $table) {
        if ($table === 'migrations') {
            continue;
        }
        $oldColumns = $old->query('PRAGMA table_info('.$quote($table).')')->fetchAll(PDO::FETCH_COLUMN, 1);
        $newColumns = $new->query('PRAGMA table_info('.$quote($table).')')->fetchAll(PDO::FETCH_COLUMN, 1);
        if (array_diff($oldColumns, $newColumns)) {
            throw new RuntimeException('Unknown local columns exist; refusing to discard them.');
        }
        $columns = array_intersect($oldColumns, $newColumns);
        $columnList = implode(', ', array_map($quote, $columns));
        $insert = $new->prepare('INSERT INTO '.$quote($table).' ('.$columnList.') VALUES ('.implode(', ', array_fill(0, count($columns), '?')).')');
        foreach ($old->query('SELECT '.$columnList.' FROM '.$quote($table)) as $row) {
            $insert->execute(array_map(fn ($column) => $row[$column], array_values($columns)));
        }
        if ($count($old, $table) !== $count($new, $table)) {
            throw new RuntimeException('Row count mismatch; live database unchanged.');
        }
    }
    $new->exec('UPDATE tickets SET created_by_id = requester_id WHERE created_by_id IS NULL');
    if (! in_array('departments', $oldTables, true)) {
        // Legacy local workspaces had no departments. Preserve their prior access in a default department.
        foreach ($new->query('SELECT id FROM organizations')->fetchAll(PDO::FETCH_COLUMN) as $org) {
            $statement = $new->prepare('INSERT INTO departments (organization_id, name, active, created_at, updated_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)');
            $statement->execute([$org, 'Helpdesk']);
            $department = $new->lastInsertId();
            $statement = $new->prepare('INSERT INTO department_memberships (organization_id, department_id, user_id) SELECT organization_id, ?, id FROM users WHERE organization_id = ?');
            $statement->execute([$department, $org]);
            $statement = $new->prepare('UPDATE tickets SET department_id = ? WHERE organization_id = ? AND department_id IS NULL');
            $statement->execute([$department, $org]);
        }
    }
    // Preserve identity high-water marks, including IDs belonging to previously deleted rows.
    foreach ($old->query('SELECT name, seq FROM sqlite_sequence') as $sequence) {
        if ($sequence['name'] !== 'migrations') {
            $statement = $new->prepare('UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = ?');
            $statement->execute([$sequence['seq'], $sequence['name']]);
        }
    }
    if ($new->query('PRAGMA foreign_key_check')->fetch() !== false) {
        throw new RuntimeException('Existing data violates the new foreign keys; live database unchanged.');
    }
    $new->commit();
    if ($new->query('PRAGMA integrity_check')->fetchColumn() !== 'ok') {
        throw new RuntimeException('Temporary database integrity check failed.');
    }
    if (! $dryRun) {
        // Apply in one transaction to the existing file so open Herd connections remain valid.
        $local->exec('ATTACH DATABASE '.$local->quote($rebuilt).' AS rebuilt');
        $local->exec('PRAGMA foreign_keys = OFF');
        $local->beginTransaction();
        foreach ($oldTables as $table) {
            $local->exec('DROP TABLE '.$quote($table));
        }
        $definitions = $new->query("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($definitions as $sql) {
            $local->exec($sql);
        }
        foreach ($newTables as $table) {
            $local->exec('INSERT INTO main.'.$quote($table).' SELECT * FROM rebuilt.'.$quote($table));
        }
        $local->exec('DELETE FROM main.sqlite_sequence');
        $local->exec('INSERT INTO main.sqlite_sequence SELECT * FROM rebuilt.sqlite_sequence');
        if ($local->query('PRAGMA foreign_key_check')->fetch() !== false) {
            throw new RuntimeException('Live foreign-key check failed; rolling back.');
        }
        $local->commit();
        $local->exec('PRAGMA foreign_keys = ON');
        $local->exec('DETACH DATABASE rebuilt');
    }
    echo ($dryRun ? 'Dry run passed; live database unchanged.' : 'Local schema upgraded; existing records preserved.').PHP_EOL;
    echo 'Tables: '.count($newTables).'; foreign-key checks passed.'.PHP_EOL;
    echo 'Backup: '.$backup.PHP_EOL;
} finally {
    if ($local->inTransaction()) {
        $local->rollBack();
    }
    if (! $maintenanceAlreadyActive) {
        $kernel->call('up');
    }
}
