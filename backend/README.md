# DeskPilot Laravel API

See [architecture, local setup and Azure deployment](../docs/laravel-backend.md).

PHP 8.3 and Laravel 12 match the available runtime. Dependencies are pinned in composer.lock. Run composer install, copy .env.example to .env, configure Entra, run php artisan key:generate and php artisan migrate, then bootstrap the first administrator.

Run php vendor/phpunit/phpunit/phpunit for security tests and php vendor/laravel/pint/builds/pint --test for formatting. Tests use SQLite in memory and locally generated RSA keys. There is no development authentication bypass.


All application accounts now use App\Models\User and the users table. Entra links are optional; standalone authentication routes are not enabled yet. The helpdesk migration defines the schema directly and was applied to the Archways Digital local test database on 2026-11-13.

Dedicated hospital hosting and shared vendor hosting use the same code. See [organization setup and owner commands](../docs/organization-deployments.md) before migrating and onboarding customers. No organizations are seeded automatically.