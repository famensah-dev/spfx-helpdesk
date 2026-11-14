<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use PDO;

class CheckDatabase extends Command
{
    protected $signature = 'helpdesk:database-check';

    protected $description = 'Check the configured PDO driver and database connectivity without changing data';

    public function handle(): int
    {
        $connection = DB::connection();
        $driver = $connection->getDriverName();
        if (! in_array($driver, PDO::getAvailableDrivers(), true)) {
            $this->error("The configured PDO driver ({$driver}) is not installed in this PHP runtime.");

            return self::FAILURE;
        }
        try {
            $connection->select('SELECT 1 AS connected');
        } catch (\Throwable) {
            // Connection exception text can contain server/user details; keep secrets out of output.
            $this->error('Database connection failed. Check credentials, firewall, TLS settings and whether a serverless database is paused.');

            return self::FAILURE;
        }
        $this->info("Database connectivity verified using {$driver}. No data was changed.");

        return self::SUCCESS;
    }
}
