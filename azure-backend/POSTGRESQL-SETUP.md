# Move DeskPilot Tickets to Azure PostgreSQL

Use this guide **after your Azure Functions backend works with SharePoint**. Nothing in this change creates Azure resources, switches live storage, or removes SharePoint data automatically.

## What Changes

| Data | After switching |
| --- | --- |
| Tickets, comments, history, Knowledge Base articles, opened receipts, assignment rotation, queued ticket emails | PostgreSQL |
| Attachment files | Private Azure Blob Storage |
| Roles, user access configuration, teams, categories, SLA settings, notification templates/history | Existing SharePoint site |
| Sign-in and authorization | Existing Entra sign-in and Azure API; PostgreSQL queries apply workspace, role and department filters |

The UI continues using the same API. The database driver pools connections, validates TLS certificates, uses parameters for all data values, and rejects stale updates. Identity and department fields are indexed. This removes SharePoint/Graph list requests from ticket reads; the current interface still requests all visible tickets. Server-side paging and database-side dashboards remain future improvements for very large workspaces. Settings/startup still depend on SharePoint.

**Azure SQL and PostgreSQL are different products.** Use `src/storage/postgres/schema.sql`, not the SQL Server schema under `storage/sql`. Existing Azure SQL workspaces continue working.

## 1. Create the PostgreSQL Server

**Where: Azure Portal — [portal.azure.com](https://portal.azure.com).**

1. Search for **Azure Database for PostgreSQL flexible servers** in the top search bar.
2. Select **Create**.
3. Choose your DeskPilot subscription and `rg-deskpilot-dev` resource group.
4. Give the server a unique name, for example `deskpilot-pg-archways-dev`.
5. Choose the **same region as your Function App**, where possible, to reduce network latency.
6. Select a supported PostgreSQL version **16 or newer**. The schema is tested with a PostgreSQL-compatible embedded engine; verify the selected Azure version before live cutover.
7. For the initial development trial, open **Compute + storage → Configure server** and explicitly choose the following before creating anything:

   | Setting | Development choice |
   | --- | --- |
   | Workload preset, if shown | Development |
   | Compute tier | **Burstable** |
   | Compute size | **B1ms** (1 vCore, 2 GiB RAM), if offered in your region |
   | Storage | **32 GiB**, or the smallest permitted size for that storage option |
   | High availability | **Disabled** — no standby server for this development trial |
   | Backup redundancy | Locally redundant for this trial; leave geo-redundant backups off |
   | Backup retention | 7 days initially |

   Click **Save** in the configuration panel, then check the cost summary again. A summary showing `Standard_D4ads_v5`, four vCores, 128 GiB and a separate high-availability charge is a much larger configuration. Do not create that configuration for this trial. If B1ms is unavailable, compare the available Burstable sizes and region pricing before proceeding.

   These are cost-conscious development settings, not a production availability recommendation. Burstable uses CPU credits and may slow under sustained load; size the live service after measuring it. High availability adds a standby and its compute/storage costs. Verify the portal's actual quote for your subscription rather than treating an earlier planning estimate as a price guarantee. See [compute choices](https://learn.microsoft.com/azure/postgresql/compute-storage/concepts-compute) and [high availability](https://learn.microsoft.com/azure/postgresql/high-availability/concepts-high-availability).
8. Configure Microsoft Entra authentication and select your database administrator. If you also enable password authentication for initial setup, keep the administrator password in Key Vault and use a separate runtime identity.
9. Configure networking so your Function App and the migration operator can connect on port **5432**. Prefer private networking with appropriate Function VNet/DNS configuration. If starting with public networking, restrict firewall rules to the actual approved client/Function outbound addresses. Do not allow the whole internet or assume the HTTPS API's public-access setting grants database access.
10. Select **Review + create → Create**.
11. Open the server after deployment. Copy its hostname, for example `deskpilot-pg-archways-dev.postgres.database.azure.com`.
12. Open the server's **Databases** page and create a database named `deskpilot`.

The PostgreSQL server adds a recurring cost even if ticket usage is low. Check the portal's estimate; the Azure SQL free offer is not a PostgreSQL offer.

## 2. Prepare Attachment Storage

**Where: Azure Portal → Storage accounts.**

1. Reuse an existing private attachment account, or create one in the same region.
2. Set anonymous Blob access to **Disabled**.
3. Under **Data storage → Containers**, create `deskpilot-attachments` with **Private** access.
4. Keep its connection string private; the current attachment adapter needs an account credential to create five-minute read links. Store the complete profile in Key Vault below.

Use a separate attachment account from Function host/deployment storage if that host account disables shared keys. Keep the Function's existing identity-based host storage settings unchanged. Configure backup/recovery for database rows **and** files; a PostgreSQL backup does not contain the blobs.

## 3. Create the Database Schema

**Where: PostgreSQL client, such as `psql` or your approved SQL editor.**

1. Connect to the new server's `deskpilot` database as the deployment administrator, with TLS certificate validation enabled.
2. Open and run [src/storage/postgres/schema.sql](src/storage/postgres/schema.sql).
3. Confirm the `deskpilot.records` table exists.

Alternatively, from the `azure-backend` terminal, configure a **local administrator** PostgreSQL profile as described in Step 5, then run:

```powershell
node --env-file=.env.local scripts/initialize-postgres.mjs postgres-main
```

This creates the schema and indexes. It does not copy tickets or activate PostgreSQL. Do not deploy the administrator profile as the application's runtime profile.

## 4. Give the Function App Database Access

**Where: Azure Portal → Function App → Settings → Identity.**

1. Confirm **System assigned → Status → On** is saved.
2. Record the Function App name, for example `deskpilot-api-archwaysdigitalgh-dev`.

**Where: PostgreSQL client, connected as the server's Microsoft Entra administrator.**

First connect to the server's **`postgres`** database and create a database role for that identity:

```sql
SELECT * FROM pgaadauth_create_principal('YOUR-FUNCTION-APP-NAME', false, false);
```

Use the actual identity name. If several identities share a name, have the administrator map the exact identity object ID using the server's Entra role-management tools.

Then connect to **`deskpilot`** and grant runtime data access. Replace the quoted role name below:

```sql
GRANT CONNECT ON DATABASE deskpilot TO "YOUR-FUNCTION-APP-NAME";
GRANT USAGE ON SCHEMA deskpilot TO "YOUR-FUNCTION-APP-NAME";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA deskpilot TO "YOUR-FUNCTION-APP-NAME";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA deskpilot TO "YOUR-FUNCTION-APP-NAME";
```

The runtime role must not own the schema or have administrator/schema-alter rights. Run future schema changes with the deployment administrator. The backend gets a fresh managed-identity token for new pooled connections; no database password is stored in the browser.

References: [Azure PostgreSQL managed-identity authentication](https://learn.microsoft.com/azure/postgresql/security/security-connect-with-managed-identity), [TLS configuration](https://learn.microsoft.com/azure/postgresql/security/security-tls-how-to-connect).

## 5. Save the PostgreSQL Connection Profile

**Where: Azure Portal → your Key Vault → Objects → Secrets.**

1. Open [postgres-profiles.example.json](postgres-profiles.example.json) locally.
2. Keep `id` as `postgres-main` and set `name` to a friendly name.
3. Replace the PostgreSQL host, database and runtime identity name.
4. Replace the attachment storage connection string and container.
5. If your workspace uses department restrictions, map **every department key** to its Entra group object ID in `departmentGroups`. Agents/admins are checked against current membership; requesters remain limited to their own requests. Site folders do not secure PostgreSQL rows.
6. Create a Key Vault secret named `deskpilot-postgres-profiles` whose Value is the entire JSON array.
7. Copy the Key Vault **Secret Identifier**.

**Where: Azure Portal → Function App → Settings → Environment variables.**

1. Add `DESKPILOT_POSTGRES_PROFILES` with this value:

   ```text
   @Microsoft.KeyVault(SecretUri=YOUR-POSTGRES-PROFILE-SECRET-IDENTIFIER)
   ```

2. Leave `DESKPILOT_SQL_PROFILES` as `[]` unless you also use Azure SQL. Profile IDs must be unique across both arrays.
3. Keep `DESKPILOT_SITE_URL` pointing to the **existing** site holding DeskPilot settings.
4. Keep the worker disabled during setup/migration: `DESKPILOT_WORKER_ENABLED=false` and `AzureWebJobs.Automation.Disabled=true`.
5. Click **Apply** on the main environment-variables page. Verify the Key Vault reference resolves.

Only profile ID, name and provider type reach the settings UI. All database/Blob credentials remain server-side.

For local initialization or migration, `.env.local` can set the same variable to a one-line JSON array. The local operator profile can use `"authentication":"password"` with a `"password"` field and a privileged deployment user. Keep its profile ID identical to the runtime profile ID. Never commit it or publish it to the Function App. Managed-identity authentication is for code running on the Azure resource; your laptop cannot impersonate the Function identity.

## 6. Build and Deploy the Updated App

**Where: VS Code → PowerShell → project root (`D:\Dev\CustomApps\spfx-helpdesk`).**

```powershell
npm ci --prefix azure-backend
npm run build --prefix azure-backend
npm test --prefix azure-backend
npm run build
```

Use Node.js 22 for the local SPFx build; the hosted Function App uses Node.js 24. Publish the updated backend from `azure-backend`:

```powershell
Set-Location azure-backend
func azure functionapp publish YOUR-FUNCTION-APP-NAME --javascript --no-build
Set-Location ..
```

Upload `sharepoint/solution/spfx-helpdesk.sppkg` to your SharePoint App Catalog, replace the existing package, and deploy. Keep the Azure API URL/resource configured in the page properties. Restart the Function App after profile changes so pooled connections use the new settings.

## 7. If You Have an Empty Workspace

**Where: DeskPilot → Settings → General → Data Storage, as a Super Admin.**

1. Select **Azure PostgreSQL + Blob Storage**.
2. Choose **DeskPilot PostgreSQL** (or your profile's name).
3. Click **Bind Storage Provider**.
4. Reload and create a test ticket, comment, attachment and article.

Binding checks the database and private container, then locks the selection. It deliberately refuses an occupied SharePoint workspace or destination. For existing tickets, use Step 8 instead. Do not empty/delete your SharePoint lists to bypass this guard.

## 8. Move Existing Tickets — Preview, Copy, Then Activate

This is an **offline maintenance operation**, run locally rather than inside a browser HTTP request. It does not delete SharePoint originals or send historical creation emails.

The tool preserves ticket/comment/article IDs, requester/creator/assignee data, ticket dates and statuses, solution-comment links, history metadata, and ticket/comment files. It verifies file bytes with SHA-256. SharePoint version field snapshots beyond the exposed history metadata, opened receipts, and old assignment-rotation cursors are not imported. Imported comments retain their displayed author, but do not grant that author ownership for adding files to an old comment. Existing roles/settings stay on the same SharePoint site.

Limits: **5 MB per file**, **256 MB total attachment bytes per snapshot**. A missing file, unresolved identity, or missing solution comment stops migration. Larger migrations need a reviewed batched importer. Plan/copy/activation read the source repeatedly to detect changes; use a maintenance window.

### 8A. Prepare the Operator Sign-in

**Where: Entra → App registrations.**

1. Create a single-tenant registration named `DeskPilot Migration Tool`. No client secret is needed for this public client.
2. Open **Authentication → Add a platform → Mobile and desktop applications**. Add the redirect URI **`http://localhost`** and save. The loopback port varies per invocation.
3. Under **API permissions → Add a permission → My APIs**, select **DeskPilot Azure API → Delegated permissions → access_as_user**.
4. Have the tenant administrator grant consent. If required by your tenant, preauthorize this client for `access_as_user` under the API registration's **Expose an API** page.
5. Copy the Migration Tool's **Application (client) ID**.

**Where: VS Code terminal, inside `azure-backend`.**

Prepare your gitignored `.env.local` with the existing backend tenant/API/client-secret/site settings and the local administrator PostgreSQL profile. A local client secret must be its actual Value, not an unresolved Key Vault reference; obtain it securely using your approved secret-management process.

Set `DESKPILOT_MIGRATION_CLIENT_ID` to the Migration Tool ID. Add that ID to the **local** `DESKPILOT_ALLOWED_CLIENT_IDS` comma-separated list. The local migration process verifies a delegated API token and the real SharePoint Super Admin role. It does not need to add this client to the deployed API's allowlist.

The script prints a Microsoft sign-in URL. Open it in your browser and sign in as the DeskPilot Super Admin. It receives the callback on localhost and keeps the token in memory. You do not need to copy tokens from browser developer tools. If conditional access blocks sign-in, have your Entra administrator resolve it; do not disable token checks.

### 8B. Preview

**Where: VS Code terminal → `azure-backend`.**

```powershell
node --env-file=.env.local scripts/migrate-sharepoint-postgres.mjs --plan postgres-main
```

Read the counts and record the printed `digest`. This command reads source data and checks destination access but does not insert anything or change storage. Keep a backup of your SharePoint lists, attachments and current DeskPilot role/workspace configuration before copying.

### 8C. Freeze Writes and Copy

1. Stop email/forms intake flows and the Azure worker.
2. Close DeskPilot sessions and prevent staff/direct-list changes for the maintenance window. The tool's flag is an operator assertion, **not** a technical lock on SharePoint or old browser sessions.
3. Keep the destination unused. Confirm backups and that the reviewed profile points to the correct database/container.
4. In the same terminal, set:

   ```powershell
   $env:DESKPILOT_MIGRATION_WRITES_FROZEN='true'
   ```

5. Run `--plan` again after freezing. Use its current digest below:

   ```powershell
   node --env-file=.env.local scripts/migrate-sharepoint-postgres.mjs --copy postgres-main YOUR-DIGEST
   ```

6. Complete sign-in again. Copy requires an empty destination workspace. It preserves IDs, copies/verifies blobs, checks source consistency and row counts, and commits the database in a transaction. SharePoint remains the active store.

On a confirmed rollback, new database rows and uploaded blobs are removed. If the commit response is uncertain, blobs are retained; verify the staged migration before retrying. Do not delete destination contents blindly. The importer holds a table write lock during staging; use an isolated database or coordinate maintenance with any other workspaces sharing it.

### 8D. Activate Separately

With writes still frozen, run:

```powershell
node --env-file=.env.local scripts/migrate-sharepoint-postgres.mjs --activate postgres-main YOUR-DIGEST
```

This re-reads the source, compares every staged record and file hash, then saves the PostgreSQL binding using the existing protected role-configuration save. A changed source or destination stops activation. It does not discard old SharePoint items.

Keep staff out until you have restarted the Function App, reopened the SharePoint page and tested Super Admin, agent and requester access, attachments, comments, archived tickets, solution links and published articles. If saving the binding fails partway through role-projection synchronization, keep maintenance in place and have the administrator reconcile the authoritative configuration and user projections before reopening. Do not assume every user's connection switched successfully.

After successful verification, remove the local migration credentials and temporary Migration Tool registration/consent if no longer needed. Remove the local freeze flag when finished. Keep source backups until the migration has been accepted. After new writes start in PostgreSQL, returning to SharePoint needs a reverse migration; it is not a safe toggle.

## 9. Restore Email Intake and Notifications

Do **not** restart old intake flows that write to the Tickets list unchanged: after cutover those writes will remain in SharePoint and will not appear in the PostgreSQL-backed app. Adapt them to an authenticated DeskPilot API integration before restoring intake. Browser-created tickets use the selected database automatically; an unattended service identity intake endpoint is not introduced by this migration.

Database ticket notification events are queued. Enable the existing Azure worker only after its Graph site/mailbox permissions and restrictions have been configured, and verify the dedicated mailbox and templates. See [README.md — background automation](README.md#11-optional-enable-background-automation). Assignment changes in the app continue to generate the existing notification events. Historical migration records intentionally generate none.

## Validation and Next Steps

Local tests run the PostgreSQL schema and repository against PGlite, exercise workspace/role/department filtering, version conflicts, private profile selection and migration rollback/verification. They do not test your Azure firewall, managed identity, server version, production data or mailbox. Complete a development migration rehearsal before live cutover.

No PostgreSQL server or live migration has been deployed by these source changes. The existing SharePoint binding stays active until you explicitly bind an empty workspace or complete migration activation.
