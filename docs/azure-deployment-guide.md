> Current test plan: Azure SQL free tier has been selected to work toward the US$20/month total budget. The PostgreSQL deployment recipe below is an alternative for a later funded deployment. Follow the [Azure SQL deployment guide](azure-sql-deployment-guide.md). Container/configuration and nullable-index migration preparation is complete; the cloud build and live SQL Server checks are still pending.

# Deploy the Archways Digital test backend to Azure

This guide moves the Laravel API to Azure App Service. React stays on the existing SharePoint page. It assumes the same Archways Digital test tenant and API registration; a hospital deployment needs its own configuration. No Azure resources have been created by these instructions.

## 1. Confirm the Azure subscription

Open https://portal.azure.com and search for **Subscriptions**. Select a subscription where you may create resources. Microsoft 365 Business Basic does not include these Azure hosting resources; Azure charges apply. Review the estimated costs shown by Azure before creating resources. This guide does not prescribe a region or paid tier without that review.

## 2. Create a resource group

Search **Resource groups > Create**. Choose the subscription, a name such as `rg-deskpilot-test`, and an approved Azure region. Use this resource group for the test registry, web app and database so they are easy to identify together.

## 3. Create the database

Search **Azure Database for PostgreSQL flexible servers > Create**. Select the test resource group, server name, region, supported PostgreSQL version, appropriate test compute/storage, administrator credentials and backup settings. Review the cost before creation.

After creation, open **Databases** and create a database named `deskpilot`. Record the server hostname, database name and database username. Store the password securely rather than in source control or this guide.

Configure network access from App Service to PostgreSQL. Private networking requires matching App Service VNet integration and DNS. For an initial public-endpoint test, restrict database firewall rules to the app's required outbound IP addresses, obtained from the App Service properties after step 5. Do not open PostgreSQL to every IP address. Keep TLS enabled. Production networking and region must follow the organization's requirements.

Reference: [Microsoft PostgreSQL creation guide](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/quickstart-create-server).

## 4. Create the registry and build the image

Create **Azure Container Registry** in the resource group. Choose a unique registry name. For the `AcrPull` instructions below, select the registry's standard **RBAC Registry Permissions** mode rather than repository ABAC permissions. Review its tier/cost.

Install/sign into Azure CLI on this development computer. From the repository root, replace the placeholders and run:

```powershell
az login
az account set --subscription <subscription-id>
az acr build --registry <registry-name> --image deskpilot-api:1.1.2 backend
```

This uploads the backend build context and builds the Dockerfile in Azure, without requiring local Docker Desktop. Wait for the build to succeed. The image is `<registry-login-server>/deskpilot-api:1.1.2`; copy the login server from the registry's Overview page.

The backend's `.dockerignore` excludes `.env`, SQLite databases, local certificates/private keys, private storage backups and cached Laravel configuration. Do not manually upload those files to the registry.

## 5. Create the Linux container web app

Create **App Service > Web App** in the same resource group:

- Publish: **Container** (or the equivalent container publishing choice in your portal).
- Operating system: **Linux**.
- Hosting plan: choose a supported Linux plan after reviewing cost and required networking features.
- Image source: your Azure Container Registry.
- Image/tag: `deskpilot-api:1.1.2`.
- Main container target port: **80**.

Configure a system-assigned or user-assigned managed identity for the app, grant that identity **AcrPull** on the registry, and select managed identity for registry authentication. A user-assigned identity can be created/granted access before the web app; a system-assigned identity can be enabled on the web app and granted access afterwards. Registry credentials do not belong in React.

For the newer sidecar-enabled configuration, use target port 80 in the main container settings. For a legacy custom-container configuration, `WEBSITES_PORT=80` is the corresponding app setting. Keep the App Service startup-command override empty; the Dockerfile starts Apache.

Enable HTTPS-only access. Copy the **Default domain** from the web app's Overview page; Azure may generate a domain with extra unique/regional components, so do not assume the name alone determines its URL.

Reference: [Microsoft custom-container and managed-identity guidance](https://learn.microsoft.com/en-us/azure/app-service/configure-custom-container).

## 6. Add Laravel environment settings

In the web app's **Settings > Environment variables** (older layouts use **Configuration > Application settings**), add these values. Replace placeholders with the actual Azure values, then save/apply:

```dotenv
APP_NAME=DeskPilot
APP_ENV=production
APP_DEBUG=false
APP_URL=https://<default-domain>
APP_KEY=<new-stable-Azure-Laravel-key>
LOG_CHANNEL=stderr
LOG_LEVEL=warning
HELPDESK_DEPLOYMENT_MODE=dedicated
HELPDESK_ORGANIZATION_SLUG=archways-digital
ENTRA_API_CLIENT_ID=a07631ff-f06f-407f-8155-661af95b1973
CORS_ALLOWED_ORIGINS=https://archwaysdigitalgh.sharepoint.com
DB_CONNECTION=pgsql
DB_HOST=<postgres-server-hostname>
DB_PORT=5432
DB_DATABASE=deskpilot
DB_USERNAME=<database-username>
DB_PASSWORD=<database-password-or-Key-Vault-reference>
DB_SSLMODE=require
CACHE_STORE=database
SESSION_DRIVER=array
QUEUE_CONNECTION=database
```

Generate a new key once on your development machine, from `backend/`:

```powershell
php artisan key:generate --show
```

Store that value as Azure's `APP_KEY`. This command displays a new key without changing the local `.env`. Keep the Azure key stable across redeployments. Manage secrets through restricted application settings or Key Vault references; do not paste them into this document or send them in chat.

Azure terminates public HTTPS. Do not upload Herd certificates or the local Windows hosts-file configuration. The API performs its own bearer-token validation; additional App Service Authentication, if enabled, must allow the intended API token audience and return API errors rather than redirecting fetch requests to interactive login pages.

## 7. Initialize the Azure database and test organization

Once the container starts and database networking is configured, open an **interactive shell in the running app container**. Current App Service offers a browser terminal under **Development Tools > SSH**; the newer Linux terminal does not require an SSH daemon in this image. Alternatively, with Azure CLI 2.90.0 or newer, use the preview interactive command:

```powershell
az webapp exec --resource-group rg-deskpilot-test --name <web-app-resource-name>
```

Use the app's main container, not the separate Kudu container. If the portal exposes only legacy WebSSH and cannot connect, use the supported interactive CLI or a controlled migration deployment task. The image does not contain a legacy SSH server. See [Microsoft container-shell guidance](https://learn.microsoft.com/en-us/azure/app-service/configure-linux-open-ssh-session).

Inside the app container, run these commands once, observing each result before continuing:

```bash
cd /var/www/html
php artisan migrate --force
php artisan helpdesk:organization-create archways-digital "Archways Digital IT Helpdesk" 3e2bbae2-139a-42d8-8250-c72eadcc3b31 --client-id=08e18876-6177-487e-b8b5-cf950c1e598c --actor=FranciscaMensah@archwaysdigitalgh.onmicrosoft.com
php artisan helpdesk:bootstrap-admin archways-digital e476f915-97d5-4ee6-a981-812e2e9d09b0 FranciscaMensah@archwaysdigitalgh.onmicrosoft.com "Francisca Mensah"
php artisan migrate:status
```

These commands target PostgreSQL using the Azure app settings. The local SQLite database is not transferred. Existing local test tickets will not appear unless a separate reviewed data migration is performed. Do not repeat organization creation/bootstrap if they already succeeded. Run database changes on one instance; do not launch concurrent migrations across all instances.

For production, use controlled migration credentials with schema permissions and a runtime identity limited to required data operations. Validate PostgreSQL migrations in this test environment before a hospital rollout.

## 8. Verify the API before changing SharePoint

Open `https://<default-domain>/up`: expect HTTP 200. Then request `/api/v1/session` with `Accept: application/json` and no bearer token: expect HTTP 401. The health endpoint alone does not verify database connectivity; successful migrations/onboarding and a real authenticated request are also needed.

Check App Service **Log stream** for startup or database errors. Test SharePoint CORS and a real sign-in before declaring the deployment complete.

## 9. Point SharePoint at Azure

On the existing DeskPilot web part, change **Laravel API URL** to:

```text
https://<default-domain>/api/v1
```

Keep **Laravel Entra API resource** as:

```text
api://a07631ff-f06f-407f-8155-661af95b1973
```

Apply, republish and reload. Sign in with the provisioned business account and verify ticket creation, updates and comments. Because the tenant, API registration and scope are unchanged, this URL change does not itself require another API registration or scope grant. If moving to a different tenant or API registration, repeat that tenant's setup and consent instead.

Once Azure testing succeeds, the app should work without this computer's Herd backend. Azure resources continue to incur charges independently of your local development environment.
