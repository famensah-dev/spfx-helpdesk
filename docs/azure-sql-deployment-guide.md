# Azure SQL test deployment

Current test plan: Laravel on Linux App Service, Azure SQL Database's free allowance, and a Basic container registry. The total budget is US$20/month. Confirm the App Service/registry estimates and any build, logging, bandwidth or tax charges before creating paid resources. A budget alert is not a spending cap. Keep SQL paid overages disabled if the database must pause at its monthly allowance.

## What is ready

- SQL database: `deskpilot`.
- SQL server: `deskpilot-laravel-sql.database.windows.net`, Canada Central.
- Administrator login: `CloudSA389fe186`; the password has not been shared or saved in source.
- Current-client IPv4 firewall rule: saved, as reported by the user.
- Container recipe: PHP 8.3 on Debian 12, Microsoft ODBC Driver 18, SQLSRV/PDO_SQLSRV 5.13.3; PostgreSQL and SQLite drivers are retained.
- TLS configuration: SQL encryption enabled and server certificate validation enabled by default.
- New SQL Server-only migration: filtered identity indexes allow multiple accounts/organizations with no Entra link while enforcing uniqueness for linked identities. Composite organization foreign keys remain in place.
- Public Azure settings template: `backend/.env.azure.example`.

The local Herd backend remains on SQLite. Docker is not installed in the current workspace environment, so this image has not been built or run locally. SQLite regression tests cannot establish SQL Server compatibility. A cloud image build and live Azure SQL migration/isolation checks are still required before considering deployment complete. No connection to Azure SQL has been attempted with credentials.

## Next portal step: registry

Open Azure portal > Container registries > Create. Select resource group `rg-deskpilot-laravel`, Canada Central and a globally unique registry name such as `deskpilotlaravelacr`. Choose **Basic** and standard **RBAC Registry Permissions**, rather than repository ABAC permissions, for the `AcrPull` setup below. Review the estimate before selecting the final Create button. Record the actual registry name and login server; no registry has been created by this guide.

## Build after registry creation and cost review

From the repository root, after signing into the correct Azure subscription:

```powershell
az login
az account set --subscription <subscription-id>
az acr build --registry <registry-name> --image deskpilot-api:sql-test-1 backend
```

This is a billable Azure build operation. The Dockerfile checks that all three PDO drivers load, and the build must succeed before deploying the image. Driver installation follows [Microsoft's Linux PHP instructions](https://learn.microsoft.com/en-us/sql/connect/php/installation-tutorial-linux-mac) and [ODBC setup](https://learn.microsoft.com/en-us/sql/connect/odbc/linux/installing-the-microsoft-odbc-driver-for-sql-server-on-linux). The pinned extension version is published on [PECL](https://pecl.php.net/package/pdo_sqlsrv/5.13.3).

## Configure the web app

Create a Linux container App Service after reviewing its plan cost. Use the registry image above and target port 80. Give the app's managed identity `AcrPull` access on the registry and configure managed identity for image pulls. Enable HTTPS-only. Keep the container startup-command override empty.

Copy settings from `backend/.env.azure.example` into App Service Environment variables, replacing the app domain/key/password placeholders privately. This file is a reference, not an automatically loaded environment. Use `DB_CONNECTION=sqlsrv`, port `1433`, database `deskpilot`, the confirmed hostname/login and TLS options. Keep the existing Entra API client ID and SharePoint CORS origin. Generate a new stable Azure APP_KEY with `php artisan key:generate --show`; it does not change the local key. Do not change the local `.env` or upload it to Azure.

Configure the SQL server firewall for the app's required outbound IP addresses (and review changes if the hosting plan changes). The rule for the development computer alone does not admit App Service. Keep TLS enabled; broad all-IP access is unnecessary. Use a restricted runtime database user after schema deployment; reserve schema privileges for controlled migration operations.

## Verify and initialize in the running application container

Use the supported interactive app-container terminal described in [Microsoft's App Service shell documentation](https://learn.microsoft.com/en-us/azure/app-service/configure-linux-open-ssh-session). From `/var/www/html`, run each command separately and check its result:

```bash
php artisan helpdesk:database-check
php artisan migrate --force
php artisan migrate:status
php artisan helpdesk:organization-create archways-digital "Archways Digital IT Helpdesk" 3e2bbae2-139a-42d8-8250-c72eadcc3b31 --client-id=08e18876-6177-487e-b8b5-cf950c1e598c --actor=FranciscaMensah@archwaysdigitalgh.onmicrosoft.com
php artisan helpdesk:bootstrap-admin archways-digital e476f915-97d5-4ee6-a981-812e2e9d09b0 FranciscaMensah@archwaysdigitalgh.onmicrosoft.com "Francisca Mensah"
```

The connectivity check performs a SELECT only and does not migrate or seed data. It must report `sqlsrv`, not `sqlite`. If it fails, check credentials, driver availability, firewall, TLS and serverless database state. Its error output intentionally omits raw connection exceptions to avoid exposing credentials. A cold database can require a retry after resuming. Inspect state before repeating migration/bootstrap commands if a previous run was interrupted.

Do not run `migrate:fresh` against this database: that command deletes tables. The additional nullable-index migration is necessary because the original migration already ran locally; it is a no-op on SQLite/PostgreSQL. Apply it on Azure after the original helpdesk migration. See [Microsoft's nullable unique-index behavior](https://learn.microsoft.com/en-us/sql/relational-databases/tables/create-unique-constraints).

## Connect SharePoint and measure

First verify `/up` returns 200 and unauthenticated `/api/v1/session` returns 401 with `Accept: application/json`. Then change the SharePoint web part's Laravel API URL to `https://<azure-default-domain>/api/v1`, retain resource `api://a07631ff-f06f-407f-8155-661af95b1973`, republish and test sign-in and ticket operations.

Verify organization isolation against the actual SQL engine before wider use. For speed comparisons, use equivalent datasets/actions and record cold-resume requests separately from warm requests. Free-tier pauses and SQL Server/PostgreSQL engine differences mean these measurements are not a production PostgreSQL benchmark. Azure starts with an empty database; the local SQLite test tickets are not transferred automatically.

## Canada Central price check (2026-11-13)

Confirmed test registry: `deskpilotlaravelacr` (`deskpilotlaravelacr.azurecr.io`), Basic tier, Canada Central, in `rg-deskpilot-laravel`. The selected subscription is `Subscription for DeskPilot`. Planned image: `deskpilotlaravelacr.azurecr.io/deskpilot-api:sql-test-1`.

Build `cx1` completed successfully on 2026-11-13 and pushed that image. Digest: `sha256:a14ed0fa9373844e4c52630832ffdc5c9f2f3d1e02263ce589b64f1967934a69`. The build verified that SQLite, PostgreSQL and SQL Server PDO drivers load. Azure SQL connectivity and migrations still require the running app's settings and firewall configuration; they have not been executed by this build.

The registry creation wizard may not display an estimate. Microsoft's public Retail Prices API returned these USD consumption rates for Canada Central:

- Container Registry Basic Registry Unit: US$0.1666/day (approximately US$5 for 30 days).
- Linux App Service Basic B1: US$0.018/hour (approximately US$13.14 for 730 hours).
- Combined baseline with SQL within its free allowance: approximately US$18.14/month, using those planning periods.

These are public retail baseline rates, not a hard cap or a tax-inclusive account quote. Taxes, registry build usage, additional storage/transfer, paid monitoring and other resources may add charges. Do not choose the Windows B1 plan: it is a different, more expensive meter. Keep the SQL free allowance configured to pause at the limit. A strict US$20 all-in budget still needs room for tax and variable usage.

Pricing source: https://prices.azure.com/api/retail/prices (filters: currencyCode USD, armRegionName canadacentral, type Consumption; Container Registry / Basic Registry Unit and Azure App Service Basic Plan - Linux / B1).
