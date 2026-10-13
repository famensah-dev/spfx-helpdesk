# DeskPilot on Azure

This is the standalone version of DeskPilot. It fills the browser content area with DeskPilot's own interface, without SharePoint headers, site navigation, app bars or page margins. SharePoint Online remains the data store; Microsoft Entra ID provides Microsoft 365 sign-in.

## Current functionality

- Shared responsive dashboard, date/status/priority/assignee filters, summary cards and charts.
- Microsoft 365 sign-in and sign-out, restricted to the configured tenant.
- Microsoft Graph list retrieval with pagination, internal column-name mapping, timeouts and bounded retries for throttling.
- Searchable read-only Tickets and My Board views.
- Explicit empty, configuration, access and data errors; no silent sample-data fallback.

FAQs and Administration remain future-module screens. Ticket creation, editing, resolution actions, attachments, comments, notifications, SLA workflows and reports are not implemented by this hosting migration. Existing Power Automate flows can continue operating against the same lists; this app does not provision them.

## Project layout

`azure-app` has an independent package.json and lockfile. It reuses the host-independent components, hooks, interfaces, SCSS and utilities in `../src/webparts/helpdeskSystem`. Keep the repository together when building; copying only azure-app is insufficient. Install this directory's dependencies to build the standalone app. The root's SPFx dependency installation is only needed when building the original web part.

The SPFx adapter supplies the PnPjs service. The Azure entry point supplies GraphTicketService through the same ITicketDataSource interface. No SPFx context, SharePoint page DOM or PnPjs runtime is required by the standalone bundle.

## 1. Register the Microsoft Entra application

In Microsoft Entra admin center, create an app registration named **DeskPilot**, with **Accounts in this organizational directory only**. Record the Directory (tenant) ID and Application (client) ID.

Under Authentication, add a **Single-page application** platform with these exact redirect URIs:

- `http://localhost:5173/` for development.
- Your final Azure HTTPS origin followed by `/` for deployment.
- Optionally `http://localhost:4173/` for Vite production preview.

Use the SPA platform, not the Web platform. MSAL Browser manages authorization-code sign-in with PKCE. Do not create or place a client secret in the frontend. The redirect URI follows the current origin, so register each origin you use.

[Microsoft SPA sign-in guidance](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-single-page-app-sign-in)

## 2. Grant Graph access

Add **delegated Microsoft Graph** permissions:

- `User.Read` for the current user's profile.
- `Sites.Selected` for the chosen SharePoint site.

Obtain the required admin consent. Sites.Selected alone grants no site access: an administrator must also grant this application **Write** access to the IT helpdesk site. The signed-in user must independently have access to the site and list. For delegated requests, application grants and user permissions both apply.

An administrator can create the site grant using their existing PnP administration connection:

```powershell
Grant-PnPEntraIDAppSitePermission -AppId '<DeskPilot-client-id>' -DisplayName 'DeskPilot' -Permissions Write -Site 'https://archwaysdigitalgh.sharepoint.com/sites/ithelpdesk'
```

For an existing Read grant, inspect and update the grant rather than creating another one:

```powershell
Get-PnPEntraIDAppSitePermission -AppIdentity '<DeskPilot-client-id>' -Site '<configured-site-url>'
Set-PnPEntraIDAppSitePermission -PermissionId '<permission-id-from-the-previous-command>' -Permissions Write -Site '<configured-site-url>'
```

Use an authenticated PnP administration connection. The client ID and site URL must match azure-app/.env.local. The signed-in DeskPilot user also needs permission to add and edit items on the configured list. Sign out and back into DeskPilot after updating the grant, then verify creation and editing.

The administration tooling needs its own elevated consent; do not add Sites.FullControl.All to the DeskPilot SPA. As a separately approved alternative, the adapter supports delegated Sites.Read.All: change VITE_GRAPH_SITE_SCOPE accordingly and consent that broader scope. It is not enabled automatically.

[Selected permissions](https://learn.microsoft.com/en-us/graph/permissions-selected-overview) · [PnP site-grant command](https://pnp.github.io/powershell/cmdlets/Grant-PnPEntraIDAppSitePermission.html)

The browser's static HTML/JS assets are public hosting assets. Ticket data is fetched only after sign-in and protected by Graph authorization. This implementation uses MSAL directly rather than Azure Static Web Apps' built-in /.auth providers. It contains no server API or secret-bearing backend.

## Organization user search and assignment

The assignment picker searches Microsoft Entra users by name/email prefix, with an optional exact department filter. It returns up to 50 matches; refine the search for more specific results. Department values come from Entra profiles, not the ticket's Department column.

In Entra admin center, open App registrations > DeskPilot > API permissions > Add a permission:

1. Microsoft Graph > Delegated permissions > User.Read.All. Grant administrator consent. This allows department-aware organization search.
2. APIs my organization uses > Office 365 SharePoint Online > Delegated permissions > AllSites.Write. Grant consent according to your tenant policy. This is broader delegated SharePoint access, bounded by the signed-in user's permissions; it is used only to resolve a selected person through the configured site's ensureuser endpoint. It does not grant the user new site membership. A Graph token cannot be sent to SharePoint REST.
3. Keep the existing Microsoft Graph Sites.Selected permission and Write grant on the configured ticket site. These still authorize ticket saves.
4. Sign out of DeskPilot and sign back in. The picker requests the directory and SharePoint tokens separately when needed. If redirected for consent, reopen assignment afterward.
5. Double-click Assigned to in a ticket row, search for a person, optionally enter the exact department name, and select them. The edit form and bulk Assign use the same search panel.

No directory or tenant grants are changed by the application. If broader SharePoint delegated consent is not acceptable, use a separately designed backend for person resolution before enabling this feature. Live tenant search and assignment still require verification after consent.

## 3. Prepare Microsoft Lists

Create **Tickets** at `https://archwaysdigitalgh.sharepoint.com/sites/ithelpdesk`, or configure the name/ID of an existing list with the matching schema. The prior screenshot reported that Tickets did not exist; deploying to Azure does not create it.

| Column | Type | Values / behavior |
| --- | --- | --- |
| Title | Single line of text | Subject |
| Status | Choice | New, In Progress, Resolved, Closed; optionally Pending and Escalated |
| Priority | Choice | Low, Medium, High, Critical |
| AssignedTo | Person | Single selection |
| Category | Choice or Text, optional | Enables category chart |
| Escalated | Yes/No, optional | Enables escalation flag |
| DueDate | Date and Time, optional | Enables overdue counts |
| ResolvedAt | Date and Time, optional | Actual resolution timestamp |

Created and Modified come from Graph's item timestamps. Column metadata resolves display names to actual internal names. Unsupported schemas produce explicit errors. The app never infers resolution from Modified.

AssignedTo is a SharePoint lookup ID, not an Entra user object ID. The adapter resolves it through the site's hidden User Information List. It discovers that list from its `/_catalogs/users` URL; if discovery does not work, set VITE_USER_INFORMATION_LIST_ID to its GUID. It reads only Title, EMail and Name from that list. If access or identities are unavailable, an explicit warning appears and My Board is disabled rather than displaying inaccurate assignments.

The dashboard defaults to tickets created in the current browser-local calendar month. All Time and custom date ranges are available. The metrics follow the definitions in the root README. Retrieval and aggregation remain client-side and should be reviewed for very large lists.

## 4. Configure and run locally

Use Node 22.14 or later within major version 22. From the repository root:

```powershell
Set-Location azure-app
npm ci
Copy-Item .env.example .env.local
```

Edit .env.local and set the tenant ID and client ID. The site URL is already set to your IT helpdesk site. Keep optional list IDs empty unless needed.

```powershell
npm run dev
```

Open `http://localhost:5173/`. No SPFx debug-manifest query string, development certificate or SharePoint loopback permission is involved. The SPA calls Microsoft Graph over HTTPS. Authentication still needs the app registration, consent and site grant.

VITE_ values are public build-time configuration, not secrets. Azure runtime application settings do not rewrite an already compiled Vite bundle. Rebuild whenever those values change. .env.local is ignored by Git and not copied into dist.

## 5. Build and deploy to Azure Static Web Apps

```powershell
npm test
npm run build
```

The publishable static files are in `azure-app/dist`. The Azure routing configuration is copied there automatically. The app is loaded as a separate chunk after successful sign-in.

Use an existing Azure resource group and a signed-in Azure CLI session. From the repository root, validate the template, then provision the Static Web App:

```powershell
az deployment group validate --resource-group '<resource-group>' --template-file azure-app/infra/main.bicep --parameters resourceName=deskpilot location=westeurope sku=Standard
az deployment group create --resource-group '<resource-group>' --template-file azure-app/infra/main.bicep --parameters resourceName=deskpilot location=westeurope sku=Standard
```

The template targets the Standard plan by default. Choose a supported region and your intended SKU; the template also accepts Free. Check Azure pricing and your organization's hosting requirements before provisioning. The deployment returns the application URL. Register that URL with a trailing slash as an Entra SPA redirect URI.

With .env.local configured, deploy the built files from azure-app using the SWA CLI and your Azure login:

```powershell
npx @azure/static-web-apps-cli deploy ./dist --app-name deskpilot --resource-group '<resource-group>' --env production
```

Use your actual resource name if it differs. Deployment credentials belong in the CLI's secure authentication flow or CI secrets, not this repository or chat. The resource template creates hosting only; it does not create Entra registrations, grant Graph permissions, create lists, assign users or deploy application files by itself.

For CI, check out the whole repository, run npm ci and npm run build in azure-app, supply the VITE_ values as build environment variables, and deploy azure-app/dist. No GitHub remote or workflow has been created automatically.

[Azure resource schema](https://learn.microsoft.com/en-us/azure/templates/microsoft.web/2024-04-01/staticsites) · [SWA CLI deployment](https://learn.microsoft.com/en-us/azure/static-web-apps/static-web-apps-cli)

## Validation limits

Automated tests cover Graph pagination, token destination restrictions, permission errors, column mapping, assignment resolution and optional-schema behavior. Shared dashboard calculations and the existing PnP service are checked separately from the repository root.

A production build can run without tenant IDs to verify compilation; the resulting app shows a configuration error until configured and rebuilt. A successful build does not prove live sign-in, site access or deployment. Verify these in your tenant:

1. Sign in as a permitted organization user; confirm sign-out and rejection of other-tenant accounts.
2. Compare dashboard counts with the Tickets list, including optional fields and filters.
3. Confirm AssignedTo names, My Board matching and denied-access behavior.
4. Test the Azure origin, redirect URI and full-window layout on desktop and mobile.

The Bicep deployment and browser interaction need validation in your Azure tenant. Azure CLI is not available in the current local workspace session, and no Azure resources have been provisioned.
