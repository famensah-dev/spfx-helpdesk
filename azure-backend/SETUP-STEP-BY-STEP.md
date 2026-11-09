# DeskPilot Azure Setup — Step by Step

**For the Azure SQL database you have already created, continue with [SQL-MIGRATION.md](SQL-MIGRATION.md)** to migrate existing SharePoint tickets. This is separate from the PostgreSQL guide.

**For Azure PostgreSQL and moving existing SharePoint tickets, continue with [POSTGRESQL-SETUP.md](POSTGRESQL-SETUP.md) after the Azure backend is working.** Do not run the Azure SQL schema against PostgreSQL.

This guide connects the DeskPilot SharePoint interface to an Azure Functions backend, while keeping your existing data in SharePoint lists.

**Already using DeskPilot successfully? Do not recreate your resources.** Use this guide as a reference and complete only unfinished steps. SQL storage and unattended automation are separate, optional tasks at the end.

## 1. Know Which Screen to Use

| When this guide says | Open |
| --- | --- |
| Azure Portal | [portal.azure.com](https://portal.azure.com) — subscriptions, Function App, Key Vault, environment variables |
| Entra | [entra.microsoft.com](https://entra.microsoft.com) — app registration, API permissions, client secret |
| SharePoint Admin Center | Your organisation's SharePoint admin centre — App Catalog and API approval |
| DeskPilot | The SharePoint page containing the DeskPilot web part |
| Terminal | VS Code → Terminal → New Terminal → PowerShell |

Azure subscription Owner, Entra administrator, and SharePoint site owner are different permissions. Use an administrator for steps your account cannot complete.

## 2. Write Down Your Addresses and Names

These are the names used for the current Archways development setup. For another organisation, replace them consistently throughout this guide.

| Item | Current development value |
| --- | --- |
| Subscription | `Subscription for DeskPilot` |
| Resource group | `rg-deskpilot-dev` |
| Function App | `deskpilot-api-archwaysdigitalgh-dev` |
| Entra app registration | `DeskPilot Azure API` |
| Key Vault | `deskpilot-kv-dev` |
| Secret name inside Key Vault | `deskpilot-api-client-secret` |
| SharePoint origin | `https://archwaysdigitalgh.sharepoint.com` |
| SharePoint site | `https://archwaysdigitalgh.sharepoint.com/sites/ithelpdesk` |
| DeskPilot page | `https://archwaysdigitalgh.sharepoint.com/sites/ithelpdesk/SitePages/DeskPilot.aspx` |

**Site URL and page URL are different.** The site URL identifies the site holding your lists. The page URL opens DeskPilot itself. Copy the working address from your browser; do not guess `Homepage.aspx` or copy a Teams-hosted URL.

Keep a private setup note containing the subscription ID, tenant ID, API client ID, frontend application ID, API domain, and Key Vault secret identifier. Never put the actual client secret value in this note or in Git.

## 3. Create the API Registration

**Where: Entra.**

1. Open **App registrations**.
2. If `DeskPilot Azure API` already exists, open it. Otherwise click **New registration**.
3. Enter **Name:** `DeskPilot Azure API`.
4. Select **Accounts in this organizational directory only**.
5. Leave **Redirect URI** empty.
6. Click **Register**.
7. On **Overview**, copy **Application (client) ID**. This is your `DESKPILOT_CLIENT_ID`.
8. Copy **Directory (tenant) ID**. This is your `DESKPILOT_TENANT_ID`.

Stay in this registration:

1. Open **Expose an API**.
2. Set **Application ID URI** to `api://` followed by the client ID you just copied. Save it.
3. Click **Add a scope**.
4. Enter **Scope name:** `access_as_user`.
5. Select **Who can consent:** Admins only.
6. Enter **Admin consent display name:** `Access DeskPilot`.
7. Enter **Admin consent description:** `Access DeskPilot on behalf of the signed-in user`.
8. Leave the scope enabled and save.
9. Open **Manifest**. Within the existing `api` object, set `requestedAccessTokenVersion` to `2`. Save. Keep the other properties.

**Check before continuing:** Expose an API lists `api://YOUR-CLIENT-ID/access_as_user`.

## 4. Add API Permissions

**Where: Entra → App registrations → DeskPilot Azure API → API permissions.**

1. Click **Add a permission → Microsoft Graph → Delegated permissions**.
2. Select these permissions and click **Add permissions**:

   | Permission | Purpose |
   | --- | --- |
   | `User.Read` | Identify the signed-in user |
   | `User.Read.All` | Search for people |
   | `Sites.Manage.All` | Manage list structure through Graph |
   | `Mail.Send` | Send notification emails |
   | `Mail.Send.Shared` | Include if sending from a shared mailbox |

3. Click **Add a permission → SharePoint → Delegated permissions**.
4. Add `AllSites.Manage` for the initial SharePoint-backed setup.
5. Ask your tenant administrator to click **Grant admin consent** and confirm.

**Check:** The permissions show consent granted for your organisation.

Do not add Full Control just because the app shows Access Required. First check both saved connections in Step 12 and the user's SharePoint role. There is a separate limitation: delegated `AllSites.Manage` masks owner permission bits used by the current owner check, and some permission-administration operations require more access. If that specific limitation prevents owner recognition or workspace administration, assess delegated `AllSites.FullControl` with your administrator. It remains limited by the signed-in user's own rights. See the [SharePoint explanation](https://github.com/SharePoint/sp-dev-docs/issues/5694).

### Find the SharePoint Frontend Application ID

**Where: Entra → Enterprise applications.**

1. Search for `SharePointOnlineWebClientExtensibility`.
2. Open the matching application.
3. Copy its **Application ID**, not its Object ID.
4. Keep this as your **frontend application ID**. It is different from the API client ID in Step 3.

For the current development tenant, the frontend application ID is `08e18876-6177-487e-b8b5-cf950c1e598c`. Verify the application in your tenant rather than copying this value into an unrelated deployment.

## 5. Create the Resource Group

**Where: Azure Portal.**

1. Use the search bar at the very top of Azure Portal to search for **Resource groups**.
2. Open **Resource groups**, then click **Create**.
3. Select your DeskPilot subscription.
4. Enter **Resource group:** `rg-deskpilot-dev`.
5. Select a region.
6. Click **Review + create**, then **Create**.

A resource group is simply the container that keeps your DeskPilot Azure resources together. If it already exists, reuse it.

## 6. Create the Function App

**Where: Azure Portal.**

1. Search for **Function App** in the top search bar.
2. Click **Create** and choose **Flex Consumption**.
3. Enter the following:

   | Field | Select or enter |
   | --- | --- |
   | Subscription | Your DeskPilot subscription |
   | Resource group | `rg-deskpilot-dev` |
   | Function App name | `deskpilot-api-archwaysdigitalgh-dev`, or another globally unique name |
   | Runtime | Node.js |
   | Version | 24 |
   | Operating system | Linux |
   | Region | A region offering this runtime and Flex Consumption |
   | Instance memory | 2048 MB initially |
   | Always ready instances | 0 initially |

4. On the remaining creation screens, use these choices for this development setup:

   | Screen / option | Choice |
   | --- | --- |
   | Storage account | Create a new account, or reuse the host storage already created during an earlier attempt |
   | Blob diagnostic settings | Configure later |
   | Azure OpenAI | Do not enable for this setup |
   | Public access | On — the SharePoint browser must reach the token-protected API |
   | Virtual network integration | Off for this initial setup |
   | Application Insights | Yes; let Azure create it |
   | Durable Task Scheduler | Leave unchecked |
   | Continuous deployment | Disable initially |
   | Resource authentication | Managed identity for storage; let Azure create the identity and suggested roles |
   | Basic authentication for deployment | Disable |
   | Tags | Optional; leave empty if you do not need them |

5. Click **Review + create**, then **Create**.
6. Wait for **Deployment succeeded**, then click **Go to resource**.
7. In the Function App, open **Settings → Identity → System assigned**. Set Status to **On**, then click **Save**.
8. Keep any existing user-assigned identity and its storage permissions. Enabling the system identity does not replace it.
9. Open **Overview**. Copy **Default domain** and put `https://` before it. This is your **Azure Backend API URL**. Azure may include a suffix and region in the domain, so do not construct it from the app name.

**Check:** The Function App exists and its status is Running. No DeskPilot functions appear yet because you have not published the code.

## 7. Create the Client Secret and Store It in Key Vault

### 7A. Create the Client Secret

**Where: Entra → App registrations → DeskPilot Azure API.**

1. Open **Certificates & secrets → Client secrets → New client secret**.
2. Enter **Description:** `deskpilot-api-client-secret`.
3. Choose an expiry according to your organisation's policy.
4. Click **Add**.
5. Copy the **Value** immediately. This is the private password. Do not copy **Secret ID**.
6. Keep this screen available until you have stored the Value in Key Vault below.

If you already created a secret and still have its Value, reuse it. If you lost the Value, create a replacement; Entra cannot display the old Value again.

### 7B. Create the Vault

**Where: Azure Portal, not Entra.**

1. Search for **Key vaults** in the top search bar.
2. Open your existing `deskpilot-kv-dev`, or click **Create**.
3. Select your subscription and `rg-deskpilot-dev` resource group.
4. Enter **Key vault name:** `deskpilot-kv-dev`, or another available name.
5. Select your region and **Standard** pricing tier.
6. Under access configuration, select **Azure role-based access control**.
7. Complete creation and click **Go to resource**.

### 7C. Give Yourself Permission to Create the Secret

**Where: Azure Portal → your Key Vault → Access control (IAM).**

1. Click **Add → Add role assignment**.
2. Search for and select **Key Vault Secrets Officer**. Click **Next**.
3. Select **User, group, or service principal**.
4. Click **Select members**, search for your own account, select it, then click **Select**.
5. Click **Review + assign** and finish the assignment.
6. Allow a few minutes for access to update, then refresh the vault screen.

Subscription Owner does not automatically grant access to secret values. If the role assignment fails, check the vault's **Activity log** for the failed operation; ask your Azure administrator to check role-assignment permission or conditions.

### 7D. Save the Secret Value

**Where: Azure Portal → your Key Vault.**

1. Expand **Objects** in the left menu.
2. Click **Secrets → Generate/Import**.
3. Enter **Name:** `deskpilot-api-client-secret`.
4. Paste the Entra secret **Value** from Step 7A into **Secret value**.
5. Click **Create**.
6. Open the secret, then open its current version.
7. Copy **Secret Identifier**. It starts with `https://` and contains `/secrets/`.

These three things are different:

| Item | What to do with it |
| --- | --- |
| Entra secret Value | Store privately inside Key Vault |
| Entra Secret ID | Do not use as the password or Key Vault reference |
| Key Vault Secret Identifier | Put inside the reference in Step 8 |

### 7E. Give the Function App Permission to Read the Secret

**Where: Azure Portal → your Key Vault → Access control (IAM).**

1. Click **Add → Add role assignment**.
2. Select **Key Vault Secrets User**. Click **Next**.
3. Select **Managed identity**, then click **Select members**.
4. Select your subscription.
5. In **Managed identity**, select **Function App**, then select your Function App's name.
6. Click **Select**, then **Review + assign** and finish.

If the identity-type list shows only **User-assigned managed identity**, return to the Function App and finish Step 6.7: enable and save its **system-assigned** identity. Reopen the member picker afterward. The Key Vault reference uses the system-assigned identity by default.

## 8. Add Environment Variables to the Function App

**Where: Azure Portal → Function App → your app → Settings → Environment variables → App settings.**

For each row below:

1. Click **Add**.
2. Enter the setting **Name** exactly as written.
3. Enter its **Value**.
4. Leave **Deployment slot setting** unchecked.
5. Confirm the entry. Repeat for the next row.
6. After adding all entries, click **Apply** on the main environment-variables page and confirm. Closing the individual Add dialog alone does not apply all pending changes.

| Name | What to enter |
| --- | --- |
| `DESKPILOT_TENANT_ID` | Directory (tenant) ID from Entra app Overview |
| `DESKPILOT_CLIENT_ID` | Application (client) ID of **DeskPilot Azure API** |
| `DESKPILOT_CLIENT_SECRET` | `@Microsoft.KeyVault(SecretUri=YOUR-KEY-VAULT-SECRET-IDENTIFIER)` — replace the placeholder with the complete identifier from Step 7D |
| `DESKPILOT_ALLOWED_CLIENT_IDS` | SharePoint frontend Application ID from Step 4, not the API client ID |
| `DESKPILOT_ALLOWED_ORIGINS` | `https://archwaysdigitalgh.sharepoint.com` — no site path or trailing slash |
| `DESKPILOT_SITE_URL` | `https://archwaysdigitalgh.sharepoint.com/sites/ithelpdesk` |
| `DESKPILOT_PAGE_URL` | `https://archwaysdigitalgh.sharepoint.com/sites/ithelpdesk/SitePages/DeskPilot.aspx` |
| `DESKPILOT_TICKETS_LIST_NAME` | Exact existing ticket list name, usually `Tickets` |
| `DESKPILOT_SQL_PROFILES` | `[]` — leave SQL unconfigured for now |
| `DESKPILOT_WORKER_ENABLED` | `false` |
| `AzureWebJobs.Automation.Disabled` | `true` |
| `DESKPILOT_AUTOMATION_SCHEDULE` | `0 */1 * * * *` — once a minute, but inactive while the worker is disabled |

For the secret setting, the final value has this shape:

```text
@Microsoft.KeyVault(SecretUri=https://YOUR-VAULT.vault.azure.net/secrets/deskpilot-api-client-secret/YOUR-VERSION)
```

Keep Azure's existing storage and monitoring settings. Do not overwrite `AzureWebJobsStorage__*`. Do not add old Windows-plan settings such as `WEBSITE_NODE_DEFAULT_VERSION` or `WEBSITE_RUN_FROM_PACKAGE` to this Flex app.

**Check:** All entries are present after refresh, and the Key Vault reference resolves. If it fails, check Step 7E, the secret identifier, and vault network access.

## 9. Save CORS

**Where: Azure Portal → your Function App.**

1. Search the Function App's left menu for **CORS**, then open it.
2. Add `https://archwaysdigitalgh.sharepoint.com` to **Allowed Origins**.
3. Remove `*` if present.
4. Leave **Enable Access-Control-Allow-Credentials** unchecked.
5. Click **Save**.

This is a second setting: entering `DESKPILOT_ALLOWED_ORIGINS` in Step 8 does not save the portal's CORS list.

## 10. Build and Publish the Backend

**Where: VS Code → Terminal → PowerShell.**

Your project root is the folder containing `package.json`, `src`, and `azure-backend`. On the current computer it is:

```powershell
Set-Location 'D:\Dev\CustomApps\spfx-helpdesk'
```

### 10A. Check the Tools

```powershell
node --version
az version
func --version
```

Use Node.js **22 locally for the SPFx frontend build**. Azure runs the backend separately on Node.js **24**. Core Tools should be version **4**.

If `az` or `func` is not recognised, install [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli-windows) or [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local#install-the-azure-functions-core-tools), close VS Code, and reopen it. Run the checks again before continuing.

### 10B. Build

Run these from the project root, one command at a time. Stop if a command fails.

```powershell
npm ci
npm ci --prefix azure-backend
npm run build --prefix azure-backend
npm test --prefix azure-backend
node tests/azureTicketService.cjs
```

The backend build generates `azure-backend/compiled`. It must be included when publishing.

### 10C. Sign In and Publish

```powershell
az login
```

Complete browser sign-in using the account for the DeskPilot subscription. Then run:

```powershell
az account set --subscription '6e24b43d-a57c-46d6-b88f-ea154e345c72'
az account show --query '{Subscription:name,Tenant:tenantId}' -o table
```

The ID above is for the current development subscription; replace it for another deployment. Confirm the displayed subscription and tenant before publishing.

```powershell
Set-Location azure-backend
func azure functionapp publish deskpilot-api-archwaysdigitalgh-dev --javascript --no-build
Set-Location ..
```

Replace the app name if yours differs. Run publish **inside `azure-backend`**, not the project root. Keep both `--javascript` and `--no-build`: the backend uses `.mjs` files and was already compiled using source outside the deployment folder.

**Check in Azure Portal:** Open your Function App → Functions. You should see **rpc** and **Automation**. Automation stays disabled at this stage. Creating the Function App in the portal alone does not upload this code.

## 11. Build and Upload the SharePoint Interface

**Where: VS Code terminal, at the project root.**

```powershell
Set-Location 'D:\Dev\CustomApps\spfx-helpdesk'
npm run build
```

Wait for the command to finish successfully.

**Where: Your organisation's SharePoint App Catalog.**

1. Open **Apps for SharePoint** in the App Catalog.
2. Upload `D:\Dev\CustomApps\spfx-helpdesk\sharepoint\solution\spfx-helpdesk.sppkg`.
3. Replace the existing package when prompted.
4. Confirm the deployment / enable-app prompt.

**Where: SharePoint Admin Center → Advanced → API access.**

1. Find the pending **DeskPilot Azure API → access_as_user** request.
2. Select it and click **Approve**.

This approval is separate from the Entra Microsoft 365 permissions in Step 4. Both are needed. The API registration name must match `DeskPilot Azure API` in `config/package-solution.json`; if you use another name, update that request and rebuild.

If approval reports a preauthorization problem, the Entra administrator should open **DeskPilot Azure API → Expose an API → Authorized client applications**, add the frontend Application ID from Step 4, and select `access_as_user`. Then retry approval.

## 12. Connect the SharePoint Page — Save Both Places

### 12A. Save the Server Connection

**Where: Azure Portal → Function App → Environment variables.**

1. Confirm `DESKPILOT_SITE_URL` is the site holding the existing lists.
2. Confirm `DESKPILOT_PAGE_URL` is the exact working DeskPilot page.
3. If you edit either, click **Apply** on the main page and confirm.

### 12B. Save the Interface Connection

**Where: SharePoint → open the actual DeskPilot page.**

1. Click **Edit** on the page.
2. Open the DeskPilot web part's properties / app page details.
3. Enter **Azure Backend API URL:** the full `https://` default domain copied from Function App Overview. Do not append `/api/rpc`.
4. Enter **Azure API Application ID URI:** `api://` followed by the API client ID from Step 3. Do not append `/access_as_user`.
5. Save the web part/page changes using **Save**, **Publish**, or **Republish**, as shown by your page.
6. Reload the page.
7. If DeskPilot offers workspace connection settings, check that its remembered site and page also refer to the same workspace; save any correction there.

**Saving Azure environment variables does not save SharePoint page properties, and saving the SharePoint page does not change Azure settings.** When correcting the connection, check both places. The page URL provides links to DeskPilot; it does not itself grant user access.

## 13. Confirm It Works

**Where: DeskPilot in SharePoint.**

1. Sign in with an existing authorised DeskPilot administrator account.
2. Confirm your existing tickets load.
3. Create a test ticket.
4. Open it, add a comment, and upload an attachment.
5. Test with an agent: confirm assigned tickets and tickets they created/requested are visible.
6. Test with a requester: confirm they see their own requests and cannot open someone else's ticket.
7. Confirm published Knowledge Base articles are visible to the intended users.
8. If testing email, check the notification settings and the sender's Exchange permissions.

Keep your existing SharePoint groups and list/folder permissions. Azure API consent does not make a user a site member or assign a DeskPilot role.

## 14. If Something Fails

| What you see | First action |
| --- | --- |
| `az` or `func` not recognised | Finish Step 10A and reopen VS Code |
| No functions after publishing | Confirm you published from `azure-backend`, built `compiled`, included dependencies, and selected Node.js 24 in Azure |
| Access Required | Check both connections in Step 12, then the user's site access and DeskPilot role groups. Do not assume the page URL grants access |
| Owner not recognised through API | Check the delegated permission masking note in Step 4 before changing permissions |
| Lists not found | Check the server's site URL and exact list name; confirm the lists exist on that site |
| Browser CORS error | Check both Step 8's origin variable and Step 9's saved CORS list |
| Key Vault reference fails | Check the Function's system identity, Secrets User role, full Secret Identifier, and vault network access |
| 401 / Sign in to DeskPilot | Check tenant ID, API client ID, token version, scope approval, and frontend client allowlist |
| `Cannot find Subscription` while creating the plan | Check the selected subscription is Active and `Microsoft.Web` and `Microsoft.App` are registered under Azure Portal → Subscriptions → your subscription → Resource providers. If it persists, give Azure support the failed deployment operation and correlation ID |

For deployment errors: **Azure Portal → Resource groups → rg-deskpilot-dev → Settings → Deployments → failed deployment → Error details**. For runtime errors: open the Function App's **Application Insights** and retain the API response's request ID.

Do not delete working resources or recreate secrets just to repeat a failed step.

## 15. Optional Work After the First Successful Test

The basic setup is finished once Step 13 passes.

- **Azure SQL:** Follow [STORAGE.md](STORAGE.md). This needs SQL, private Blob storage, schema creation, managed-identity access, and a server storage profile. Selecting SQL does not migrate existing SharePoint tickets.
- **Unattended assignment and emails:** Follow [README.md — Enable Background Automation](README.md#11-optional-enable-background-automation). This requires separate application permissions for the worker's managed identity and mailbox restrictions. Do not enable the timer merely because its schedule is configured.
- **Moving to another site:** Review the Azure site/page variables, SharePoint interface/workspace connection, site permissions, and any worker site grants together. Test before directing users to the new workspace.
