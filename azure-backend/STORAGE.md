# Configurable workspace storage

The SPFx interface calls the same authenticated Azure API for either provider.
Super Admins choose **Settings → General → Data Storage** in an API-connected workspace.
SharePoint-only SPFx deployments keep their existing behaviour and do not show this setting.

| Data | SharePoint provider | SQL provider |
| --- | --- | --- |
| Tickets, comments, history, opened receipts, articles | SharePoint lists | Azure SQL |
| Attachments | SharePoint attachments | Private Azure Blob Storage |
| Roles, group membership, workspace configuration | SharePoint | SharePoint |
| Teams, categories, priorities, SLA rules, email templates and notification history | SharePoint | SharePoint |
| Automatic email delivery | Existing implementation | SQL event queue, delivered by the Azure timer |

This is a hybrid SQL data provider, not a removal of all SharePoint dependencies.
Initialize the SharePoint workspace first: its lists still supply the administration/control plane
and built-in ticket field metadata. SQL stores the app's built-in ticket fields as JSON documents
with indexed identity/department columns; it does not generate SQL columns from SharePoint schema edits.

## Code boundaries

```text
src/services.mjs                  Authenticated session and provider selection
src/dispatch.mjs                  API operation authorization
src/storage/management.mjs        Super Admin binding and migration guards
src/storage/profiles.mjs          Server-only connection allowlist
src/storage/sharepoint/provider.mjs
src/storage/sql/
  provider.mjs                    Shared roles/settings and SQL service composition
  repository.mjs                  Parameterized SQL and rowversion checks
  schema.sql                      Indexed, workspace-isolated records
  tickets.mjs                     Ticket/comment/history operations
  knowledge.mjs                   Article publication and management
  routing.mjs                     Team matching and rotation
  attachments.mjs                 Private blobs and five-minute read links
  worker.mjs                      Leased email queue and SQL-ticket SLA checks
```

The existing shared role rules execute on the server for both providers. Requesters see their own
requests; agents retain access to created/requested tickets and can change their status without
gaining management of another agent's assignment. SQL queries include the workspace and role scope;
comments and attachments require access to their parent ticket. No database credentials are returned
to the browser. SQL failures do not fall back to SharePoint writes.

## Prepare Azure SQL and Blob Storage

No resources are automatically deployed by this change.

1. Create an Azure SQL database and a storage account with anonymous blob access disabled.
   Create a **private** `deskpilot-attachments` container. Configure SQL networking so the Function
   can connect, and use SQL backups/retention appropriate to your organisation.
   Use a separate attachment storage account from the template's Function host/deployment account:
   host storage disables shared keys, while the current attachment adapter uses a protected account
   connection string to issue short-lived read links. Keep host storage identity authentication intact.
2. Configure the Function's managed identity as an Azure SQL database user, with `SELECT`, `INSERT`,
   `UPDATE`, and `DELETE` on schema `deskpilot`. Use a separate deployment identity with schema
   creation permissions for initialization. The SQL client enforces encrypted connections and
   validates the server certificate.
3. Set server-only `DESKPILOT_SQL_PROFILES` to a JSON array shaped like
   [sql-profiles.example.json](sql-profiles.example.json). The `id` and `name` are the only profile
   values shown in the UI. Store the JSON in Key Vault and use a Function app-setting reference
   in production. The Bicep parameter `sqlProfilesReference` accepts this reference.
   Blob links currently use the storage account credential in that protected profile; rotate it
   through the server configuration. Do not put the connection string in SPFx properties or Git.
4. Run the additive schema script with your deployment identity:

   ```powershell
   # From azure-backend, with DESKPILOT_SQL_PROFILES provided securely in the environment:
   node scripts/initialize-sql.mjs primary
   # Alternatively, a gitignored .env.local can provide local environment values:
   node --env-file=.env.local scripts/initialize-sql.mjs primary
   ```

   You can also run `src/storage/sql/schema.sql` with your SQL deployment tooling. This creates
   tables/indexes; it does not copy or delete tickets. Do not run the application with a SQL admin account.
5. For department workspaces, map **every department key** to its Microsoft Entra group object ID
   in `departmentGroups`. Agent/admin departmental access is checked against current group membership;
   ordinary requesters remain limited to their own requests. Ensure the delegated Graph permissions
   allow `/me/checkMemberGroups` for your tenant. Missing mappings fail closed. The Super Admin role
   retains organisation-wide access. This replaces folder ACL enforcement for SQL tickets only.

## Bind an empty workspace

Before staff begin using the workspace, open the Azure-connected app as a Super Admin and select
the provider and connection under **Data Storage**, then choose **Bind Storage Provider**.
Database/schema access and private-container configuration are checked before saving.

Binding is deliberately one-time. Existing tickets/articles in either the current SharePoint workspace
or destination SQL workspace block a change. Existing data is **not migrated automatically**. Binding
an occupied workspace requires a separate migration/import procedure, with a backup, downtime,
identity mapping and verification. A workspace with existing data continues on SharePoint.
Do not bind during active use; close older app sessions first. In-flight requests and direct list
access are outside the setup checks. After SQL binding, direct SPFx/SharePoint mode refuses to open
the workspace; all supported DeskPilot clients must use the API.

The SQL workspace key is derived from tenant ID and site URL. Moving a workspace to another site
also requires migration; editing its URL does not move its data.

## Background delivery and intake

Enable the existing automation timer (`DESKPILOT_WORKER_ENABLED=true`, disable the
`AzureWebJobs.Automation.Disabled` setting) and configure the dedicated mailbox and application
Graph permissions described in [README.md](README.md). In SQL mode it processes SQL events and SLA
checks instead of the SharePoint ticket intake queue. API ticket creation routes by the configured
category/team, sets assigned tickets to **In Progress**, and queues creation notifications. Status
and assignment changes also queue their notifications, using the existing DeskPilot templates.
The queue uses rowversion leases and retries; Graph notification keys provide duplicate protection.
Delivery is at least once, not a guarantee of exactly-once mail after every possible server failure.
Ticket changes and event insertion currently use separate SQL statements: an event-insertion failure
is reported to the caller and needs administrator reconciliation; this is not a transactional outbox.

Power Automate must call the authenticated API's `createTicket` operation for SQL intake, using the
existing RPC body `{ "method": "createTicket", "args": [{ ...ticketInput }] }`. Email/AI preparation
can stay in the flow. Direct database inserts bypass validation, routing and notification enqueueing
and are unsupported. The API continues to require a delegated Entra token; an unattended application
credential intake endpoint is not added here.

## Validation

Run `npm run build` and `npm test` in `azure-backend`, then the production build in the repository root.
Storage tests exercise role restrictions, stale edits, private attachment access, published article
visibility, round-robin routing, queue retry/order, parameterized SQL scope and binding protection.
They use mock storage/HTTP boundaries. A real Azure SQL/Blob/Entra smoke test is required before production;
the local changes do not constitute verification against your tenant or a live database.
