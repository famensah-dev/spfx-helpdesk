# Move Existing SharePoint Tickets to Azure SQL

This guide is for **Azure SQL Database**, not PostgreSQL. The SQL database and attachment account have already been created for the current development setup:

| Item | Current value |
| --- | --- |
| SQL server | `deskpilot-sql-archways-dev.database.windows.net` |
| Database | `deskpilot-pg-archways-dev` — the `pg` in the name does not change its database engine |
| Connection profile ID | `primary` |
| Attachment storage account | `deskpilotfilesdev` |
| Private container | `deskpilot-attachments` |
| Function App | `deskpilot-api-archwaysdigitalgh-dev` |
| Resource group | `rg-deskpilot-dev` |
| Key Vault | `deskpilot-kv-dev` |
| SQL profile secret | `deskpilot-sql-profiles` |

**Do not click Bind Storage Provider for the occupied workspace.** Use the migration procedure below. It copies first and switches the app only after a separate activation command. SharePoint originals are retained.

## 1. Finish Connection Setup

These items must be ready before copying:

- The SQL schema in [src/storage/sql/schema.sql](src/storage/sql/schema.sql) has run in the target database.
- The Function's system-assigned identity has `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on schema `deskpilot`.
- `DESKPILOT_SQL_PROFILES` resolves through Key Vault to the profile for the database above. The Function identity must have **Key Vault Secrets User** on the SQL profile secret or the vault. Access to only the API-client-secret entry does not grant access to this additional secret.
- The attachment container is private and the SQL profile contains its account connection string. The current adapter requires account key access for attachments.
- Your **migration operator account** can connect to Azure SQL as the Entra database administrator, read the source SharePoint data as a DeskPilot Super Admin, read the required Function settings, and read the two Key Vault secrets. These are separate permissions.

The migration operator temporarily needs table-owner/`ALTER` permission because preserving existing IDs uses `SET IDENTITY_INSERT`. Do not give this additional permission to the runtime Function identity. Use the database administrator for the offline migration.

## 2. Build and Deploy the Connection Test

**Where: VS Code → PowerShell → project root (`D:\Dev\CustomApps\spfx-helpdesk`).**

```powershell
npm ci --prefix azure-backend
npm run build --prefix azure-backend
npm test --prefix azure-backend
npm run build
```

Use Node.js 22 for the local SPFx build; the hosted backend runs on Node.js 24.

Publish the backend:

```powershell
Set-Location azure-backend
func azure functionapp publish deskpilot-api-archwaysdigitalgh-dev --javascript --no-build
Set-Location ..
```

Upload `sharepoint/solution/spfx-helpdesk.sppkg` to the SharePoint App Catalog, replace the existing package and deploy. These updates add the read-only connection test; they do not migrate or switch storage.

**Where: DeskPilot → Settings → General → Data Storage.**

1. Choose **Azure SQL + Blob Storage**.
2. Choose **DeskPilot SQL** under Database Connection.
3. Click **Test Connection**, not Bind Storage Provider.
4. Confirm the success message says the database and private attachment storage are reachable from the backend.

If testing fails, fix the database firewall/network route, Function identity permissions, or storage access before proceeding. Your earlier **Add current client IP** rule allows your computer; it does not automatically allow the Function App. Do not enable access for all Azure resources without reviewing that scope. The database currently resides in Canada East and the Function in West US 3, so measure cross-region latency too.

This read-only test checks connection/schema reads and private-container access, not every runtime write permission. Verify the grants in Step 1 and perform functional tests after cutover.

## 3. Prepare an Operator Sign-in

**Where: Microsoft Entra admin centre → App registrations.**

If you already created `DeskPilot Migration Tool` for PostgreSQL, reuse it.

1. Create a registration named **DeskPilot Migration Tool** with **Accounts in this organizational directory only**.
2. Open **Authentication → Add a platform → Mobile and desktop applications**.
3. Add **`http://localhost`** as the redirect URI and save. The script uses a random local port for each sign-in.
4. Open **API permissions → Add a permission → My APIs → DeskPilot Azure API → Delegated permissions**.
5. Add **`access_as_user`**, then have your tenant administrator grant consent.
6. If your tenant requires preauthorization, add the Migration Tool's application ID under **DeskPilot Azure API → Expose an API → Authorized client applications** for `access_as_user`.
7. Record the Migration Tool's **Application (client) ID**. No client secret is needed for this public desktop client.

The tool signs in as a real user and verifies that user's Super Admin access. It never exposes a public migration RPC method. The Migration Tool ID does not need to be added to the deployed API's frontend allowlist; the local process validates its token against a temporary in-memory allowlist.

## 4. Load Configuration Securely

**Where: VS Code PowerShell → `azure-backend` folder.**

Sign in to Azure CLI as the authorised migration operator:

```powershell
az login
az account set --subscription '6e24b43d-a57c-46d6-b88f-ea154e345c72'
```

If `az` is not recognised on the current Windows computer, reopen VS Code after installation, or add its installed directory for this terminal:

```powershell
$env:Path = 'C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin;' + $env:Path
```

Set these public metadata values. Replace `YOUR-MIGRATION-CLIENT-ID` with Step 3's Application ID:

```powershell
$env:DESKPILOT_MIGRATION_AZURE_RESOURCE_ID='/subscriptions/6e24b43d-a57c-46d6-b88f-ea154e345c72/resourceGroups/rg-deskpilot-dev/providers/Microsoft.Web/sites/deskpilot-api-archwaysdigitalgh-dev'
$env:DESKPILOT_MIGRATION_VAULT_NAME='deskpilot-kv-dev'
$env:DESKPILOT_MIGRATION_CLIENT_ID='YOUR-MIGRATION-CLIENT-ID'
```

The script reads the selected Function's configuration, resolves the needed Key Vault references with your operator permissions, and keeps secrets in memory. It does not print secret values, write a credentials file, or change Function settings. The PostgreSQL variable is ignored for this SQL migration. It uses Azure CLI credentials locally for SQL, while the deployed Function continues using its managed identity.

The local SQL profile must support your operator sign-in; the configured `azure-active-directory-default` authentication does. The computer's IP must also be allowed through the SQL firewall.

Advanced alternative: omit `DESKPILOT_MIGRATION_AZURE_RESOURCE_ID` and supply a gitignored `.env.local` containing backend settings and a SQL deployment-identity profile. Never publish local administrator credentials to the Function or commit that file.

## 5. Disable Automation and Preview

**Where: Azure Portal → Function App → Environment variables.**

Confirm both are saved and applied:

```text
DESKPILOT_WORKER_ENABLED=false
AzureWebJobs.Automation.Disabled=true
```

**Where: VS Code terminal → `azure-backend`.**

```powershell
node scripts/migrate-sharepoint-sql.mjs --plan primary
```

The terminal prints a Microsoft sign-in link. Open it in a browser, choose your DeskPilot Super Admin account, complete sign-in, and return to the terminal. Tokens stay in memory; do not extract them from browser developer tools or paste them into chat.

Preview reads the source and checks destination access without inserting data or switching storage. Check the printed target database, attachment account, counts and `digest`. The digest binds the source and destination, so a changed source or target requires a new preview.

The tool includes tickets, comments, articles, history metadata and ticket/comment attachments. It preserves ticket/comment/article IDs and solution-comment references. It does not create historical notification events or modify the source lists.

Before copying, back up the SharePoint lists, attachments and DeskPilot role/workspace configuration. Use an empty destination workspace. Do not delete existing data just to bypass an occupied-destination error.

## 6. Freeze Writes and Copy

1. Pause email/forms intake flows and confirm the Azure worker remains disabled.
2. Close DeskPilot sessions and prevent direct-list/staff changes during maintenance. The tool's freeze flag is an operator acknowledgement, not a technical lock on SharePoint or old browser sessions.
3. Keep the destination unused. The migration takes an exclusive table lock, so coordinate with other workspaces if they share this database.
4. In the same PowerShell terminal, run:

   ```powershell
   $env:DESKPILOT_MIGRATION_WRITES_FROZEN='true'
   node scripts/migrate-sharepoint-sql.mjs --plan primary
   ```

5. Record the new `digest`, then replace `YOUR-DIGEST` below:

   ```powershell
   node scripts/migrate-sharepoint-sql.mjs --copy primary YOUR-DIGEST
   ```

Complete interactive sign-in again. Copy runs in a serializable SQL transaction on a pinned connection, uses explicit source IDs, verifies row content/counts and Blob hashes, and commits a staging manifest. It does not save a new storage binding. SharePoint remains active.

If copying fails and rollback is confirmed, new destination records and uploaded files are removed. If commit/rollback cannot be confirmed, files are retained to avoid deleting potentially committed attachments. Run verification before retrying; do not blindly empty the database/container. Gaps in generated IDs after a rollback are harmless.

## 7. Verify, Then Activate

With writes still frozen:

```powershell
node scripts/migrate-sharepoint-sql.mjs --verify primary YOUR-DIGEST
```

Verification re-reads the source and checks each copied record and attachment. It does not change storage. Only after it passes, explicitly activate:

```powershell
node scripts/migrate-sharepoint-sql.mjs --activate primary YOUR-DIGEST
```

Activation verifies the copy again and saves `provider: sql`, `connectionId: primary`, `locked: true` using the protected SharePoint role-configuration save. It does not set PostgreSQL storage or delete SharePoint originals.

Restart the Function App and reload DeskPilot so sessions use the new binding. Before reopening writes, test tickets, requester/agent restrictions, comments, attachments, archived tickets, solution links, articles, and a new ticket/edit. Check **Settings → General → Data Storage** shows Azure SQL and the correct connection.

If saving the binding fails during user-projection synchronization, keep maintenance active. The authoritative configuration and user projections must be reconciled before staff reconnect. Do not assume all users switched successfully after a partial error.

## 8. Restore Intake Deliberately

Old flows that create tickets directly in the SharePoint Tickets list will continue writing there and will not populate SQL. Redirect them to a supported authenticated API intake integration before restoring them. This tool does not introduce an unattended service-identity intake endpoint.

Database ticket email events use the existing worker. Enable it only after its mailbox/site permissions and restrictions are ready, then test notifications. Migration intentionally sends no historical ticket-created emails.

Keep source backups until the migration is accepted. After new SQL writes begin, reverting to SharePoint requires a reverse migration; changing a setting alone would lose access to those new records. Remove the temporary Migration Tool registration/consent when no longer needed.

## Limits and Validation

- Maximum migrated file size: **5 MB**; total attachment bytes per snapshot: **256 MB**. Larger migrations need a reviewed batched importer.
- History migration includes the metadata exposed by DeskPilot's history service, not complete SharePoint field-version snapshots. Opened receipts and old rotation cursors are not copied.
- Imported comments preserve displayed author names. Ownership for attaching files to historical comments is not inferred from a display name.
- Roles, teams, classifications, SLA rules and notification settings remain in SharePoint on the same site.
- Tests exercise parameter binding, transaction/session ordering, ID preservation, verification, rollback and uncertain-commit behavior using an mssql contract fixture. PostgreSQL regression tests use an embedded engine. These do not establish live SQL Server syntax/network/identity compatibility; rehearse against a disposable Azure SQL workspace before production cutover.

No live tickets are migrated by building or deploying these changes. Only explicit copy/activation commands perform those operations.
