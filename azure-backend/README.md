# DeskPilot Azure backend branch

This branch keeps the current SPFx/Teams interface and SharePoint lists, and runs the current shared DeskPilot services in an Azure Functions Node 22 API. The web part requires an API connection; it does not fall back to direct list calls. The older `azure-app/server` prototype is not this backend and should not be deployed for this branch.

## Local preparation

From the repository root (Node 22):

```powershell
npm ci
npm ci --prefix azure-backend
npm run build --prefix azure-backend
npm test --prefix azure-backend
node tests/azureTicketService.cjs
npm run build
```

The backend build compiles the **current** shared services into `azure-backend/compiled`. Deploy that compiled folder with the backend; it has no SPFx or browser runtime dependency. Its tiny SharePoint HTTP adapter supplies the existing services with delegated tokens. Email HTML uses the exact shared sanitizer in an inert server DOM.

For the local HTTP API, copy `.env.example` to `.env.local`, fill in your own registration values, then run `npm start --prefix azure-backend`. It listens on loopback port 7071. The worker does not run in this standalone development server. No tenant changes or resources are created by these commands.

For the real Functions host, install Azure Functions Core Tools v4 and Azurite separately. Copy `local.settings.example.json` to `local.settings.json`, supply the same settings, run Azurite, then run `func start` inside `azure-backend`. The worker remains explicitly disabled in this example. SPFx runs in an HTTPS SharePoint page, so its browser needs an HTTPS API endpoint: use Core Tools' trusted local HTTPS configuration or an approved development HTTPS endpoint. Do not point it at ordinary HTTP localhost from an HTTPS page.

## Entra and SharePoint configuration (when you are ready)

1. Register a single-tenant **web API** named **DeskPilot Azure API**. Set `api.requestedAccessTokenVersion` to `2`, expose `api://<API-client-id>/access_as_user`, and configure a server credential. Store the production credential in Key Vault. It never belongs in the web part, VITE variables, a page URL, or source control.
2. Set `DESKPILOT_ALLOWED_CLIENT_IDS` to the exact client ID of the tenant's **SharePoint Online Client Extensibility Web Application Principal** used by SPFx. Resolve it in your own tenant rather than guessing an ID. A separately registered standalone SPA can be added explicitly. The API validates signature, issuer, audience, tenant, authorized client, expiry and delegated scope.
3. The backend app needs delegated Microsoft Graph `User.Read`, `User.Read.All` (person search), `Sites.Manage.All` (existing list/schema/setup features), `Mail.Send`, and `Mail.Send.Shared` if shared sending is used. SharePoint REST person resolution, role groups and setup require delegated SharePoint `AllSites.Manage`. Obtain administrator consent. These delegated permissions remain bounded by the signed-in user's SharePoint permissions. A future split of read/write/setup credentials could narrow these grants; this branch preserves the existing administrative feature set.
4. The SPFx package now requests **DeskPilot Azure API / access_as_user**, instead of the direct Graph/list grants. After deploying that package later, approve this custom API request in SharePoint API Access. The API registration display name must match the package request, or adjust `config/package-solution.json` before packaging. Removing old tenant-wide grants is a separate administrator decision; this branch does not revoke them.
5. Configure `DESKPILOT_SITE_URL`, `DESKPILOT_PAGE_URL`, and `DESKPILOT_TICKETS_LIST_NAME` on the **server**. This is the authoritative workspace. Browser URL overrides and the old Teams connection JSON cannot redirect backend operations.
6. In the web part property pane, set **Azure Backend API URL** to the Function App origin (no `/api/rpc` suffix), and **Azure API Application ID URI** to `api://<API-client-id>`. These identifiers are public configuration.
7. Keep existing SharePoint role groups and site/list/folder ACLs. The API resolves those groups server-side on each request; requester scope remains own tickets. Delegated requests do not grant new SharePoint membership. API authorization does not revoke direct SharePoint access: lists/folders must still have correct permissions.

API CORS permits only exact configured origins. Include the actual SharePoint hosting origin for SPFx/Teams, not `*`. An Origin header is not authentication; JWT validation applies independently. No function key is embedded in the browser: the HTTP trigger is `anonymous` at the Functions layer because the application validates Entra bearer tokens itself.

## Unattended intake and SLA worker

The `Automation` timer uses the official Functions Node SDK and runs once a minute when enabled. Azure host storage provides the timer monitor/lease across instances. This is independent of an open browser.

- Initialize the workspace through the backend to add indexed **AutomationReady**, a Yes/No ticket column defaulting to No.
- Existing email/forms intake flows should set **AutomationReady = Yes only after categorization and attachment uploads complete**. Normal DeskPilot creation already routes and sends notifications through the API; it does not set this intake flag.
- The worker applies existing team/category routing, preserves existing assignees and moves assigned tickets to In Progress. It submits the existing created/assigned email templates and in-app notifications, then resets AutomationReady to No using an ETag. It does not create tickets.
- The worker also evaluates SLA breaches and uses the existing team-lead template/notification keys. Notification keys prevent repeated confirmed sends; failed or unconfirmed delivery is retained for manual review, not blindly resent.
- Azure's system-assigned managed identity needs Microsoft Graph **application** `Sites.Selected` plus a Write grant to the workspace. If it sends mail, configure Graph application `Mail.Send` with Exchange application access/RBAC restricted to the dedicated helpdesk mailbox. Set `DESKPILOT_WORKER_MAILBOX`. Grant Key Vault secret-read access separately to the Function identity for the API's OBO credential reference.
- Only after these grants are verified, set `DESKPILOT_WORKER_ENABLED=true` and `AzureWebJobs.Automation.Disabled=false`. Local app-only execution additionally requires the explicit `DESKPILOT_ALLOW_LOCAL_WORKER=true` opt-in and separately consented application permissions. Do not enable that for ordinary frontend testing.

The shared notification settings still govern recipients and enabled events. The worker forces its actual sending identity to the configured mailbox; configure that same mailbox in DeskPilot Sender Settings. No AI service is bundled: existing intake AI remains in your flow. A ticket without a matching category can remain in a team queue or unassigned according to existing routing settings.

## Deployment preparation, not deployment

`infra/main.bicep` prepares a Windows Consumption Function App, private storage, HTTPS/TLS settings and managed identity. It leaves the timer disabled. Supply a Key Vault credential reference; grant the identity access before starting the API. No Entra registrations, Graph grants, Exchange rights, Key Vault permissions or live resources are created automatically by this repository.

Publish `azure-backend` only after `npm run build --prefix azure-backend` and `npm ci --omit=dev --prefix azure-backend`. `package.json` points Functions to `src/functions.mjs`. `compiled`, `src`, `host.json`, package files and production node_modules must be present in the deployment. The SPFx package is generated separately at `sharepoint/solution/spfx-helpdesk.sppkg`.

No Azure resources have been deployed as part of local preparation. Core Tools and Azure CLI are not installed in the current workstation session, so live Functions-host behavior, Bicep deployment, Entra consent, SharePoint tenant integration and mailbox delivery still require deployment-environment validation. For large lists, the reused Graph services still load/aggregate tickets; server-side paging and a durable job queue are future scaling work.

References: [Functions Node programming model](https://learn.microsoft.com/azure/azure-functions/functions-reference-node), [On-behalf-of flow](https://learn.microsoft.com/entra/identity-platform/v2-oauth2-on-behalf-of-flow), [Timer trigger](https://learn.microsoft.com/azure/azure-functions/functions-bindings-timer), [Selected permissions](https://learn.microsoft.com/graph/permissions-selected-overview).
