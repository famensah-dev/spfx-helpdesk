# Set Up DeskPilot in Azure

Follow these steps in order. First connect the Azure backend to your **existing SharePoint lists**.
Once that works, you can add Azure SQL using Step 10.

| Part | Where it runs | Purpose |
| --- | --- | --- |
| DeskPilot interface | SharePoint / Teams | The screens your users see |
| DeskPilot API | Azure Functions | Checks access, reads/saves data, and handles backend operations |

Use the `with-backend` branch and the `azure-backend` folder. The older `azure-app/server` folder is not used.
No Azure resources have been deployed for you by the local code changes.

## Before You Start

You need:

- An Azure subscription associated with your organisation's Microsoft 365 / Entra directory.
- Permission to create Azure resources and register an Entra application.
- An administrator who can approve Entra API permissions and SharePoint API access.
- Your existing DeskPilot SharePoint site URL and the actual page where DeskPilot runs.
- Node.js **22** for the local SPFx build, Azure CLI, and Azure Functions Core Tools **v4** on your computer.
- Select Node.js **24** for the hosted Azure Functions backend. Backend tooling supports Node.js 22 and 24.

Azure subscription access does not automatically give you Entra or SharePoint administrator access.

In a VS Code PowerShell terminal, check:

```powershell
node --version
az version
func --version
```

Node should show `v22...`; use the latest Core Tools **v4** and an up-to-date Azure CLI with Flex support.
This is the local frontend build version: the project's SPFx 1.23.2 toolchain requires Node.js 22.
The Azure backend runs separately on Node.js 24; its shared JavaScript can be compiled locally on 22.
If you use a Node version manager, use 22 for commands at the repository root and 24 for backend-only testing.
References: [SPFx compatibility](https://learn.microsoft.com/sharepoint/dev/spfx/compatibility),
[Azure Functions Node.js support](https://learn.microsoft.com/azure/azure-functions/functions-reference-node).
If a command is missing, install
[Node.js](https://nodejs.org/en/download), [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli-windows),
or [Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local#install-the-azure-functions-core-tools), then reopen your terminal.

## 1. Check Your Tenant

1. Sign in to [Azure Portal](https://portal.azure.com).
2. Open **Subscriptions**, select your subscription, and check its directory.
3. Make sure this is the same organisation/directory that hosts your SharePoint site.
4. Open **Microsoft Entra ID → Overview** and record the **Tenant ID**.

If the subscription belongs to a personal or different directory, resolve that with your administrator
before continuing. This implementation expects one tenant.

## 2. Register the DeskPilot API

Open **Microsoft Entra ID → App registrations → New registration**:

| Field | Enter |
| --- | --- |
| Name | `DeskPilot Azure API` |
| Supported account types | Accounts in this organizational directory only |
| Redirect URI | Leave blank |

Choose **Register**. Record its **Application (client) ID** and **Directory (tenant) ID**.
You will use both in Step 6.

Inside this registration, open **Expose an API**:

1. Set **Application ID URI** to `api://YOUR-APPLICATION-CLIENT-ID`.
2. Choose **Add a scope**.
3. Set **Scope name** to `access_as_user`.
4. Set **Who can consent** to **Admins only**.
5. Set the admin consent display name to `Access DeskPilot`.
6. Set its description to `Access DeskPilot on behalf of the signed-in user`.
7. Leave it enabled and save.

Open **Manifest**. Inside the `api` object, set `requestedAccessTokenVersion` to `2` and save.
Keep the other manifest properties.

**Checkpoint:** Expose an API shows `api://YOUR-APPLICATION-CLIENT-ID/access_as_user`.
Reference: [Expose a web API](https://learn.microsoft.com/entra/identity-platform/quickstart-configure-app-expose-web-apis).

## 3. Add the Microsoft 365 Permissions

Stay inside **DeskPilot Azure API → API permissions → Add a permission**.
Choose **Microsoft Graph → Delegated permissions** and add:

| Permission | Used for |
| --- | --- |
| `User.Read` | Identifying the signed-in user |
| `User.Read.All` | Searching people for requesters and agents |
| `Sites.Manage.All` | Lists, columns, and workspace setup |
| `Mail.Send` | Sending DeskPilot emails |
| `Mail.Send.Shared` | Add this if you will send from a shared mailbox |

Then choose **Add a permission → SharePoint → Delegated permissions** and add `AllSites.FullControl`.
DeskPilot needs this delegated scope to recognise site owners and administer SharePoint groups and item permissions. `AllSites.Manage` masks the `ManageWeb` and `ManagePermissions` bits used by the owner check, so an owner can incorrectly reach **Access Required** through the Azure API.
Choose **Delegated permissions**, not Application permissions. This does not give ordinary users site-owner rights: SharePoint still limits each request to the signed-in user's permissions.

If you already followed the earlier `AllSites.Manage` instructions, add `AllSites.FullControl`, grant administrator consent again, then restart the Function App to clear its cached delegated tokens and reload DeskPilot. After the replacement is consented, the narrower `AllSites.Manage` permission is redundant.
Reference: [SharePoint explanation of OAuth permission masking](https://github.com/SharePoint/sp-dev-docs/issues/5694).

Ask your tenant administrator to select **Grant admin consent**.
These are delegated permissions: the signed-in user still needs the appropriate SharePoint access.
Sending from a shared mailbox also requires the appropriate Exchange sending rights.

**Checkpoint:** The required permissions show administrator consent granted.

Next, find the frontend's application ID:

1. Open **Microsoft Entra ID → Enterprise applications**.
2. Search for **SharePointOnlineWebClientExtensibility**.
3. Open it and copy its **Application ID**, not its Object ID.
4. Record this separately as the **SharePoint frontend Application ID**.

This ID is different from the DeskPilot API's client ID. If you cannot find it, ask your
SharePoint/Entra administrator to identify the tenant's SPFx extensibility principal.

## 4. Create the Azure Resources

Use **Flex Consumption**, which runs on **Linux**, with **Node.js 24**. The repository's
[infra/main.bicep](infra/main.bicep) now targets the same hosting plan.

In Azure Portal:

1. In the portal's top search bar, search **Resource groups**, open it, then choose **Create**.
   Select your subscription, enter `rg-deskpilot-dev` as the name, choose a region, and select
   **Review + create → Create**. This group keeps DeskPilot's Azure resources together.
2. Open **Create a resource → Function App**.
3. Under **Select a hosting option**, choose **Flex Consumption → Select**. Do not choose the legacy Consumption option.
4. Enter the following and create the app:

   | Field | Value |
   | --- | --- |
   | Resource group | `rg-deskpilot-dev` |
   | Function App name | A unique name, for example `deskpilot-api-ORG-dev` |
   | Runtime | Node.js |
   | Version | 24 |
   | Operating system | Linux (Flex Consumption is Linux-only) |
   | Region | A region that offers Flex Consumption and Node.js 24 |
   | Instance memory | 2048 MB for the initial setup |
   | Always ready instances | Leave at 0 for this development setup |
   | Storage account | Create a new host storage account |
   | Application Insights | Enable for diagnostics |

5. On the resource **Authentication** creation tab, use **Managed identity** for host/deployment storage.
   Let the portal create the identity and storage permissions. This tab configures resource access,
   not the DeskPilot user's sign-in flow. Leave the deployment storage container configured by Azure.
   After creation, open **Identity → System assigned → On → Save** as well: DeskPilot uses the
   system-assigned identity for Key Vault and the background worker.
6. Copy its **default domain** from Overview. Your API URL is `https://` followed by that domain.
   Copy the actual domain rather than guessing it from the app name.
7. Create a **Key Vault** in the same resource group, using Azure role-based access control.

If the region does not offer Flex / Node 24, choose another supported region. You can list regions with:

```powershell
az functionapp list-flexconsumption-locations -o table
```

An Azure administrator can alternatively deploy [infra/main.bicep](infra/main.bicep). Use that or the
manual resource-creation steps, not both. The template does not create your Entra registration,
Key Vault, API consent, or mailbox permissions.

The template uses a **system-assigned identity** for host storage and a private `deskpilot-deployments`
container for code packages, with Blob, Queue, and Table data-role assignments on that storage account.
Deploying it requires permission to create role assignments, not just resources. The portal may instead
create a user-assigned identity for storage; keep its storage settings and grants intact. Neither path
needs an always-ready instance by default. Wait for storage role assignments to propagate before publishing.

Reference: [Create and manage a Flex Consumption app](https://learn.microsoft.com/azure/azure-functions/flex-consumption-how-to).

### Deployment Succeeded? Continue Here

Creating the Function App completes the resource-creation part of Step 4. Finish these actions before Step 5:

1. **Azure Portal:** click **Go to resource** to open your Function App.
2. **Azure Portal, inside the Function App:** open **Settings → Identity → System assigned**,
   set **Status → On**, and **Save**.
   Keep the existing user-assigned identity: it handles storage/monitoring access from the portal setup.
   The system-assigned identity will handle Key Vault and the background worker.
3. **Azure Portal, inside the Function App:** open **Overview** and copy the **default domain**.
   Keep it for the API URL in Step 9.
4. Continue with **Step 5 below**, in order. It explains creating the API secret in Microsoft Entra ID,
   creating/opening Key Vault in Azure Portal, and storing the secret there.

The remaining order is: **API secret in Key Vault → Function App settings → publish backend →
deploy/connect the SharePoint interface**. Creating the Azure resource has not uploaded DeskPilot's code.

## 5. Put the API Secret in Key Vault

Use the following names consistently. The vault is the container; the secret is an entry inside it.

| Item | Name |
| --- | --- |
| Entra app registration | `DeskPilot Azure API` |
| Client secret Description in Entra | `deskpilot-api-client-secret` |
| Azure Key Vault | `deskpilot-kv-archways-dev`, if available |
| Secret Name inside Key Vault | `deskpilot-api-client-secret` |

If you already created the app secret or vault, reuse it; do not create a duplicate or rename it
just to match the example. Continue from the first unfinished action below.

### 5A. Microsoft Entra ID: Create the API Client Secret

**Where:** [Microsoft Entra admin center](https://entra.microsoft.com), in your organisation's directory.

1. Open **App registrations → DeskPilot Azure API → Certificates & secrets**.
2. Select **Client secrets → New client secret**.
3. In **Description**, enter `deskpilot-api-client-secret`.
4. Choose an expiry according to your organisation's policy and select **Add**.
5. Copy the new secret's **Value**, not its **Secret ID**. Keep it private for Step 5C.
   The value is only shown when the secret is created. If you already created it and saved its value,
   use that value instead of creating another secret.

### 5B. Azure Portal: Create or Open Key Vault

**Where:** [Azure Portal](https://portal.azure.com). Leave the Entra app-registration screens for this step.

1. In Azure Portal's **top search bar**, search **Key vaults** and open it.
2. If you already created your DeskPilot vault, select its name and continue to Step 5C.
3. Otherwise select **+ Create** and fill in:

   | Field | Enter |
   | --- | --- |
   | Subscription | `Subscription for DeskPilot` |
   | Resource group | `rg-deskpilot-dev` |
   | Key vault name | `deskpilot-kv-dev` (choose a unique name if unavailable) |
   | Region | West US 3 |
   | Permission model / Access configuration | Azure role-based access control |

4. Select **Review + create → Create**, then **Go to resource**.

### 5C. Azure Portal, Inside Key Vault: Store the Secret

1. Open your vault's **Access control (IAM)**. Your account needs secret-creation access,
   such as **Key Vault Secrets Officer**. Subscription Owner alone does not automatically grant
   permission to read/write secret values. If needed, use **Add role assignment** to grant
   **Key Vault Secrets Officer** to your own user account at this vault's scope.
2. After the role assignment propagates, open **Objects → Secrets → Generate/Import**.
3. Set **Name** to `deskpilot-api-client-secret`.
4. In **Value**, paste the Entra client secret **Value** from Step 5A. Do not paste its Secret ID.
5. Select **Create**.
6. Open `deskpilot-api-client-secret`, select its current version, and copy its **Secret Identifier**.
   This is a Key Vault HTTPS URL, different from both the Entra Secret ID and the private secret value.

### 5D. Azure Portal, Inside Key Vault: Let the Function Read the Secret

1. Open **Access control (IAM) → Add role assignment**.
2. Select the role **Key Vault Secrets User**.
3. For **Assign access to**, select **Managed identity**.
4. Select your **Function App's system-assigned identity** and finish the role assignment.
   For this deployment, the Function App is `deskpilot-api-archwaysdigitalgh-dev`.
   Keep the existing `deskpilot-api-archwaysdigitalgh-dev-uami` identity and its storage permissions unchanged.
5. Wait for the assignment to propagate. If the vault has network restrictions, the Function also
   needs network access to it.

Use the following reference in Step 6:

```text
@Microsoft.KeyVault(SecretUri=PASTE-THE-SECRET-IDENTIFIER-HERE)
```

Keep the secret out of source code, frontend properties, page URLs, and Git. Renew it before expiry.
Reference: [Key Vault references for Functions](https://learn.microsoft.com/azure/app-service/app-service-key-vault-references).

## 6. Enter the Function App Settings

**Where: Azure Portal**, inside your Function App (`deskpilot-api-archwaysdigitalgh-dev` for this deployment).
Open **Settings → Environment variables → App settings**.
Some portal views call this **Configuration → Application settings**.

Add these settings, replacing the examples:

| Name | Value |
| --- | --- |
| `DESKPILOT_TENANT_ID` | Directory/tenant ID from Step 2 |
| `DESKPILOT_CLIENT_ID` | DeskPilot API Application/client ID from Step 2 |
| `DESKPILOT_CLIENT_SECRET` | Key Vault reference from Step 5 |
| `DESKPILOT_ALLOWED_CLIENT_IDS` | SharePoint frontend Application ID from Step 3 |
| `DESKPILOT_ALLOWED_ORIGINS` | `https://YOURTENANT.sharepoint.com` — no site path or trailing slash |
| `DESKPILOT_SITE_URL` | `https://YOURTENANT.sharepoint.com/sites/YOURSITE` |
| `DESKPILOT_PAGE_URL` | The actual page, for example `https://YOURTENANT.sharepoint.com/sites/YOURSITE/SitePages/DeskPilot.aspx` |
| `DESKPILOT_TICKETS_LIST_NAME` | Your existing ticket list name, usually `Tickets` |
| `DESKPILOT_SQL_PROFILES` | `[]` for this initial SharePoint-backed test |
| `DESKPILOT_WORKER_ENABLED` | `false` |
| `AzureWebJobs.Automation.Disabled` | `true` |
| `DESKPILOT_AUTOMATION_SCHEDULE` | `0 */1 * * * *` |

Keep the host-storage settings created by Azure, including any `AzureWebJobsStorage__*` identity settings.
Do not replace them with the local Azurite connection string. Save/apply the settings.
Check that the Key Vault reference resolves after the identity's role assignment propagates.

On Flex, Node.js 24 is selected under the app's runtime configuration (`functionAppConfig.runtime`
in the template), rather than Windows app settings. Do **not** add `WEBSITE_NODE_DEFAULT_VERSION`,
`WEBSITE_RUN_FROM_PACKAGE`, `FUNCTIONS_WORKER_RUNTIME`, `FUNCTIONS_EXTENSION_VERSION`, or
`SCM_DO_BUILD_DURING_DEPLOYMENT` to the deployed Flex app. The local.settings example still uses
local Core Tools settings; do not bulk-publish it into Azure.
Reference: [Flex settings that must not be copied from legacy plans](https://learn.microsoft.com/azure/azure-functions/functions-app-settings#flex-consumption-plan-deprecations).

## 6b. Next, configure CORS so your SharePoint page can call the API.

In Azure Portal → your Function App:
1. Use the left-menu search to find CORS.
2. Under Allowed Origins, add:https://archwaysdigitalgh.sharepoint.com
3. Remove * if present.
4. Leave Enable Access-Control-Allow-Credentials unchecked.
5. Click Save.
After that, we’ll build and publish the backend code.

This API validates Entra bearer tokens itself. Its HTTP trigger uses `authLevel: anonymous` at the
Functions layer, but ticket access still requires a valid token. Do not put a Function key in the frontend.
This walkthrough does not add a separate App Service Authentication provider on top of that validation.

## 7. Build and Publish the Backend

Open VS Code PowerShell at the **repository root**, not inside `azure-backend`:

```powershell
npm ci
npm ci --prefix azure-backend
npm run build --prefix azure-backend
npm test --prefix azure-backend
node tests/azureTicketService.cjs
```

The backend build creates `azure-backend/compiled`. That folder must be deployed with the backend.

Sign in, select your subscription, and publish. Replace the uppercase placeholders:

```powershell
az login
az account set --subscription "YOUR-SUBSCRIPTION-ID"
Set-Location azure-backend
func azure functionapp publish YOUR-FUNCTION-APP-NAME --no-build
Set-Location ..
```

Publish the Function App created in Step 4. Do not publish the SPFx repository root as the Function App.
Deployment needs `src`, `compiled`, `host.json`, package files, and backend runtime dependencies.
The included `.funcignore` excludes local environment files; do not upload local secrets separately.

Keep `--no-build`: the earlier command already compiled shared SPFx services into `compiled`.
The backend build needs source files outside the published folder, so a second remote build of only
`azure-backend` is not appropriate. Flex's deployment tool uploads the prebuilt package using OneDeploy
and the configured deployment container. Do not set `WEBSITE_RUN_FROM_PACKAGE` or use an old Windows
ZIP-deploy recipe. Keep the installed runtime `node_modules` in the package. Current backend runtime
dependencies are JavaScript; if native dependencies are added, build/install those on Linux before publishing.
Reference: [Deploy precompiled Node/TypeScript Functions](https://learn.microsoft.com/azure/azure-functions/typescript-build-options).

**Checkpoint:** The Function App lists **rpc** and **Automation**. Automation remains disabled.
If neither appears, check startup logs/Application Insights, settings, runtime, dependencies, and `compiled`.

Check the API route without signing in:

```powershell
curl.exe -i -X POST "https://YOUR-ACTUAL-FUNCTION-DOMAIN/api/rpc" -H "Content-Type: application/json" -d '{"method":"session","args":[]}'
```

Expect **401 / Sign in to DeskPilot**, because you have not supplied a bearer token. This verifies
the route and authentication rejection, not full Microsoft 365 access; Step 9 tests that.
Reference: [Core Tools deployment](https://learn.microsoft.com/azure/azure-functions/functions-run-local).

## 8. Deploy the SharePoint Interface

From the **repository root**, run:

```powershell
npm run build
```

Upload `sharepoint/solution/spfx-helpdesk.sppkg` to your SharePoint App Catalog and deploy the update.
Ask your SharePoint administrator to open **SharePoint Admin Center → Advanced → API access** and
approve **DeskPilot Azure API → access_as_user**.

The resource name in `config/package-solution.json` must match your API registration's name.
If you renamed the registration, update that request and rebuild before uploading.
If approval reports a consent/preauthorization error, have the Entra administrator check the scope
and frontend principal from Step 3. **Expose an API → Authorized client applications** can preauthorize
that frontend Application ID for `access_as_user` when required by the tenant's consent configuration.

Reference: [SPFx custom API permissions](https://learn.microsoft.com/sharepoint/dev/spfx/use-aadhttpclient).

## 9. Connect DeskPilot and Test It

1. Edit the SharePoint page containing DeskPilot.
2. Open the DeskPilot web part's properties.
3. Set **Azure Backend API URL** to your Function App's HTTPS origin, without `/api/rpc`.
4. Set **Azure API Application ID URI** to `api://YOUR-APPLICATION-CLIENT-ID`.
5. Save and publish the page, then reload it.

Test these before adding SQL or background automation:

- Existing SharePoint tickets load.
- You can create a test ticket, add a comment, and upload an attachment.
- Agents see assigned tickets and tickets they created/requested.
- Requesters see their own requests and cannot open someone else's ticket.
- Knowledge Base readers see published articles.

Keep existing SharePoint role groups and site/list/folder permissions. The API reads them server-side;
delegated API permission does not give someone site membership. To test email delivery, enable the
desired notification rule in DeskPilot and verify the sender's mailbox rights.

## 10. Optional: Use Azure SQL for Tickets

Skip this if you want to keep SharePoint as the ticket store.

SQL mode stores tickets, comments, history, opened receipts, and articles in SQL, with attachments in
Blob Storage. SharePoint still stores roles, teams, categories, SLA settings, and email templates.

Follow [STORAGE.md](STORAGE.md) for:

1. Creating Azure SQL and a private Blob container.
2. Running [schema.sql](src/storage/sql/schema.sql) with a deployment identity.
3. Giving the Function's managed identity database permissions.
4. Configuring the server-only SQL/Blob profile and any department group mappings.
5. Selecting **Settings → General → Data Storage → Azure SQL + Blob Storage** as a Super Admin.

Use an **empty development workspace**. Binding does not migrate existing data, and occupied workspaces
cannot simply switch providers. Bind before staff start using it, with old sessions closed.
After SQL binding, all DeskPilot clients must use the API.
SQL ticket emails are queued and require the worker in Step 11 to deliver them.

## 11. Optional: Enable Background Automation

Do this after Step 9 works. Your Entra/Exchange administrator must configure the **Function App's
managed identity**, separately from the API registration's delegated permissions:

| Access | Required configuration |
| --- | --- |
| Workspace lists | Graph application `Sites.Selected`, plus a Write grant to the workspace site |
| Unattended mail | Graph application `Mail.Send`, restricted to the helpdesk mailbox using Exchange application access/RBAC configuration |
| Server secrets | Key Vault Secrets User from Step 5 |

Verify those site/mailbox restrictions before enabling the timer. Then update the Function settings:

| Name | Value |
| --- | --- |
| `DESKPILOT_WORKER_MAILBOX` | Your dedicated/shared helpdesk mailbox address |
| `DESKPILOT_WORKER_ENABLED` | `true` |
| `AzureWebJobs.Automation.Disabled` | `false` |

Configure that same mailbox in DeskPilot Sender Settings and enable the desired notification rules.

For **SharePoint ticket storage**:

1. Run DeskPilot **Initialize Workspace** to add the `AutomationReady` Yes/No field.
2. In email/forms flows, set `AutomationReady = Yes` only after categorization and attachments finish.
3. The worker checks ready tickets every minute, routes them, submits the existing templates, and
   resets the flag. It preserves existing assignees and also checks SLA breaches.

For **SQL ticket storage**, the worker processes SQL notification events and checks SQL-ticket SLA
breaches. External intake must call the authenticated DeskPilot API; direct SQL inserts bypass its rules.
See [STORAGE.md](STORAGE.md) for queue and delivery limitations.

This timer runs in Azure without an open browser. AI categorization stays in your existing flow;
an AI service is not bundled. Check notification history and Exchange before resending a notification
marked failed or unconfirmed.

## Troubleshooting

| Problem | Check |
| --- | --- |
| No functions appear | Required settings, Node version, dependencies, publish folder, and generated `compiled` output |
| 401 from DeskPilot | Tenant/client ID, token version 2, scope consent, and the frontend Application ID allowlist |
| Browser CORS error | Exact SharePoint origin in both CORS and `DESKPILOT_ALLOWED_ORIGINS`; inspect the HTTP response for startup errors too |
| Key Vault reference fails | Managed identity, Secrets User role, secret URI, and vault network access |
| SharePoint access denied / lists missing | Server site URL, list binding, delegated consent, user site access, and role groups |
| SQL emails do not arrive | Worker enabled, mailbox application permissions, notification settings, and notification history |
| Cannot bind SQL | Existing data, locked binding, missing SQL profile/schema, missing department mappings, or a public Blob container |

Use Application Insights and the API response's request ID to investigate backend failures.

## Optional: Local Backend Development

You can skip this section and test against the deployed HTTPS development API instead.

From the repository root:

```powershell
Copy-Item azure-backend/.env.example azure-backend/.env.local
```

Fill in `.env.local` with your development registration/settings, then run:

```powershell
npm run build --prefix azure-backend
npm start --prefix azure-backend
```

This starts a token-protected API at `http://127.0.0.1:7071`; it does not run the timer.
An HTTPS SharePoint page cannot call this plain HTTP endpoint directly. Use the deployed HTTPS API
or an approved, trusted local HTTPS setup for SPFx testing.

For the actual local Functions host, install Azurite. Inside `azure-backend`, copy
`local.settings.example.json` to `local.settings.json`, fill in the values, start Azurite, and run
`func start`. Keep automation disabled for frontend testing. Local app-only worker execution also
requires `DESKPILOT_ALLOW_LOCAL_WORKER=true` and separately granted application permissions.

Do not commit `.env.local` or `local.settings.json`.

## Validation Status

Local frontend/backend builds and automated tests have been run. These do not verify your live
tenant, database, networking, mailbox, or deployment. Complete Step 9 before staff use.
Large SharePoint lists still need paging/caching improvements; Azure hosting alone does not remove
the existing full-list queries.
