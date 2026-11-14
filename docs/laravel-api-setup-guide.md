## SETTING UP LARAVEL BACKEND IN AZURE
## 1. First, register the Laravel API:
1. Open Microsoft Entra admin center using your business administrator account.
2. Go to Entra ID → App registrations → New registration.
3. Enter DeskPilot Laravel API.
4. Select Accounts in this organizational directory only for this initial test.
5. Leave Redirect URI blank and select Register.
6. On Overview, copy:
   - Application (client) ID
   - Directory (tenant) ID
7. Open Expose an API:
   - Set the Application ID URI to api://<application-client-id>.
   - Add a scope named access_as_user.
   - Set who can consent to Admins only.
   - Use “Access DeskPilot” for the consent display name and “Access DeskPilot as the signed-in user” for its description.
   - Enable and save the scope.
8. Open Manifest. Within the api object, set:"requestedAccessTokenVersion": 2
   Save your changes.
These steps expose the API permission that SharePoint will request.
Once that’s saved, send me the SharePoint site URL where you’ll test DeskPilot.


## 2. Next upload the spfx package to sharepoint admin center apps catalogue:
1. Upload [spfx-helpdesk.sppkg](D:/Dev/CustomApps/spfx-helpdesk-laravel/sharepoint/solution/spfx-helpdesk.sppkg) to your SharePoint tenant App Catalog, replacing the previous package, and deploy it.
2. Open SharePoint admin center → Advanced → API access. Approve:
   - Resource: DeskPilot Laravel API
   - Permission: access_as_user
   This grants SharePoint permission to call your API. Microsoft’s instructions

## 3. Find the user and SharePoint identifiers

**Already completed for the Archways Digital test setup.** You do not need to collect these IDs again. Keep these instructions for another tenant or administrator.

API approval and the identifiers serve different purposes:

- API approval allows SharePoint to request access to DeskPilot's API.
- Your user Object ID identifies the person who receives a local DeskPilot administrator account.
- SharePoint's Application ID identifies the client allowed to call Laravel.

### A. Find your own user Object ID

1. Open [Microsoft Entra admin center](https://entra.microsoft.com/) and sign in with the business account that administers the tenant.
2. Confirm the directory shown in the account/directory menu is **Archways Digital**. If you administer several directories, switch to the intended tenant before collecting identifiers.
3. Expand **Entra ID**, then open **Users > All users**.
4. Search for the email address you use to sign in to Microsoft 365. For this test, use `FranciscaMensah@archwaysdigitalgh.onmicrosoft.com`.
5. Select the matching user to open their profile.
6. On **Overview**, locate **Object ID** and use the copy button beside it. If it is not visible there in your portal layout, check the profile's **Properties** tab.
7. Record it as **Administrator Entra user Object ID**.

Recorded for this test: `e476f915-97d5-4ee6-a981-812e2e9d09b0`.

This ID comes from **Users**, not App registrations or Enterprise applications. An app registration's Object ID identifies an application object, not your user account.

Reference: [Microsoft: get your signed-in identity and user Object ID](https://learn.microsoft.com/en-us/entra/identity/users/how-to-get-signed-in-identity).

### B. Find SharePoint's calling Application ID

1. In the same tenant, open **Entra ID > Enterprise applications > All applications**. Some portal layouts label the menu **Enterprise apps**.
2. Use the application-list search box to search for **SharePoint Online Web Client Extensibility**.
3. If no result appears, clear a restrictive **Application type = Enterprise Applications** filter, or choose **All applications** as the application type, then search again. Microsoft first-party applications can be hidden by the default filter.
4. Select the matching application.
5. Open **Overview** and locate **Application ID**. Use its copy button. Do not copy **Object ID** from this page.
6. Record the application name together with its Application ID.
7. Also search for **SharePoint Online Client Extensibility Web Application Principal**. This is the older SPFx principal. If present, record its Application ID separately. Only deliberately trusted client IDs are added to an organization's allowlist; a legacy entry is not automatically required just because it exists.

Recorded for this test:

- Application name: **SharePoint Online Web Client Extensibility**.
- Application ID: `08e18876-6177-487e-b8b5-cf950c1e598c`.

This is different from the **DeskPilot Laravel API** registration's client ID, `a07631ff-f06f-407f-8155-661af95b1973`. SharePoint is the caller; DeskPilot Laravel API is the destination.

References: [Microsoft: view enterprise applications and adjust filters](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/view-applications-portal), [Microsoft: SPFx client-principal transition](https://devblogs.microsoft.com/microsoft365dev/changes-on-sharepoint-framework-spfx-permission-grants-in-microsoft-entra-id/).

### C. Record the hosting choice

The hosting choice is a setup decision, not a setting to find in Entra. For this test, **local HTTPS was selected and configured** at `https://deskpilot-api.test`.

If deploying the same test environment to Azure next, these identifiers can remain the same. The API address and production hosting configuration change. A separate hospital tenant would require its own identifiers and consent.
## Archways Digital test configuration

- SharePoint page: https://archwaysdigitalgh.sharepoint.com/sites/ithelpdesk/SitePages/DeskPilot.aspx
- SharePoint site: https://archwaysdigitalgh.sharepoint.com/sites/ithelpdesk
- Organization slug: archways-digital
- Test administrator user Object ID: e476f915-97d5-4ee6-a981-812e2e9d09b0
- Selected backend hosting for this test: locally over HTTPS
- Local HTTPS setup: working at https://deskpilot-api.test; verified with certificate validation enabled.
- Test administrator database account: created as Super Admin for FranciscaMensah@archwaysdigitalgh.onmicrosoft.com (Francisca Mensah).
- SharePoint package upload and API approval: completed, as reported by the user.
- SharePoint calling Application ID: 08e18876-6177-487e-b8b5-cf950c1e598c (SharePoint Online Web Client Extensibility); saved in the organization allowed-client list.
- Entra tenant ID: 3e2bbae2-139a-42d8-8250-c72eadcc3b31
- Laravel API application/client ID: a07631ff-f06f-407f-8155-661af95b1973
- API resource: api://a07631ff-f06f-407f-8155-661af95b1973
- Delegated scope: access_as_user

The local backend .env now contains the test deployment mode, organization slug, API audience and SharePoint CORS origin. Existing secrets were preserved. Database migration and Archways Digital organization onboarding completed locally on 2026-11-13. A pre-migration SQLite backup is stored under backend/storage/app/private/setup-backups/.

The SPFx package version is now 1.1.2.0 and requests DeskPilot Laravel API / access_as_user. After deploying the package to your tenant App Catalog, approve that permission in SharePoint admin center > API access. Only the custom API permission is needed for the Laravel core workflow; other permissions still listed in the package support the legacy SharePoint mode.

Identifier collection and local HTTPS setup are complete for this test. See section 3 above for the steps to repeat when setting up another tenant.

## Connect the SharePoint web part to local Laravel

Local setup completed on 2026-11-13:

- Organization: archways-digital / Archways Digital IT Helpdesk, active with no expiry.
- Administrator: FranciscaMensah@archwaysdigitalgh.onmicrosoft.com, role Super Admin.
- Entra object ID: e476f915-97d5-4ee6-a981-812e2e9d09b0.
- Health URL: https://deskpilot-api.test/up
- Laravel API URL: https://deskpilot-api.test/api/v1
- Laravel Entra API resource: api://a07631ff-f06f-407f-8155-661af95b1973

1. Open https://deskpilot-api.test/up on this computer. It should load successfully without a certificate error.
2. Open https://archwaysdigitalgh.sharepoint.com/sites/ithelpdesk/SitePages/DeskPilot.aspx and edit the page/web part. If the full-page host hides editing, open the page menu in Site Pages and choose Edit, then open the DeskPilot web part property pane.
3. Set Laravel API URL to https://deskpilot-api.test/api/v1.
4. Set Laravel Entra API resource to api://a07631ff-f06f-407f-8155-661af95b1973.
5. Apply the properties and republish the page, then reload it signed in as the provisioned business user.

Browser sign-in and a token-authenticated request from SharePoint still need to be tested. Modern Edge/Chrome may request local-network access when SharePoint connects to your local backend. Allow that permission for this development connection if prompted; do not disable browser security globally. Reference: https://learn.microsoft.com/en-us/deployedge/ms-edge-local-network-access

This address works on this computer while Herd is running. Other computers need their own backend connection or a shared hosted API. The local database is separate from the old SharePoint lists; existing list tickets are not automatically imported.

### Local HTTPS certificate details

Herd's existing shared root CA expired on 2026-10-28. A certificate restricted to deskpilot-api.test was generated instead, trusted for the current Windows user, and installed for the Herd alias. A hosts entry maps deskpilot-api.test to 127.0.0.1. This certificate expires after one year. The global Herd CA was not replaced.

The development helpers are backend/tools/create-local-certificate.php and backend/tools/install-local-https.ps1. The installer supports -WhatIf and requires an elevated PowerShell session. Certificates, private keys, installation metadata and file backups are in ignored private storage at backend/storage/app/private/local-https/. Do not regenerate the certificate while the site is in use unless you intend to reinstall its trust. Herd secure can overwrite this site's certificate; if that happens before its shared CA is repaired, reinstall the prepared DeskPilot certificate.

Verified checks: HTTPS health 200; unauthenticated API session 401; SharePoint-origin API preflight 204 with the expected CORS origin. TLS verification was enabled for these checks. Live Entra sign-in is the next step.

## Deploy this test environment to Azure

Follow the [Azure deployment guide](azure-deployment-guide.md) for the ordered portal setup, container build, application settings, PostgreSQL migration, organization bootstrap and SharePoint API URL change. Azure deployment is not yet performed.



## Creating the PostgreSQL Database
1. Open Azure Portal.
2. Search for Azure Database for PostgreSQL flexible servers.
3. Open it and select Create.
4. On the Basics tab, use:
   Setting	Value
   Subscription	Your Azure subscription
   Resource group	rg-deskpilot-laravel
   Server name	deskpilot-laravel-pg—add a unique suffix if unavailable
   Region	The region intended for your Laravel App Service
   Workload type	Development for this test
   High availability	Disabled for this test
Microsoft’s creation wizard offers these settings. Official guide

Stay on this screen before selecting Create. Tell me which region, PostgreSQL version, and compute/storage configuration it currently shows, so we can check them before you incur charges.

## Azure SQL test database (current cloud plan)

The budget is US$20/month for the whole application. Azure SQL's free offer was selected for this test instead of the earlier paid PostgreSQL plan. Laravel hosting costs still need review.

- Resource group: rg-deskpilot-laravel
- Azure SQL database: deskpilot
- Azure SQL logical server: deskpilot-laravel-sql
- Server hostname: deskpilot-laravel-sql.database.windows.net
- Region: Canada Central
- SQL administrator login: CloudSA389fe186 (confirmed from the Azure server properties).
- Password: keep in secure local/Azure configuration only, never this guide or chat.
- Laravel Azure SQL preparation: container drivers, encrypted connection settings and nullable-identity compatibility migration added. Cloud container build and live SQL Server migration/integration checks remain pending.
- Current local backend: remains on its working SQLite database.

Next portal step: open the SQL server > Security > Networking > Public access. For a connection from this development computer, choose Selected networks, add the current client IPv4 address, and Save. Keep broad Allow Azure services and resources access disabled for now. App Service's outbound access will be configured separately after the web app exists. Do not add an all-address IP range.

Verify the deployed database still has its free allowance and paid overages disabled. A free database does not include free Laravel hosting.

For the current Azure SQL deployment path, follow [Azure SQL deployment guide](azure-sql-deployment-guide.md). Use backend/.env.azure.example as the Azure settings reference; the working local .env stays on SQLite.