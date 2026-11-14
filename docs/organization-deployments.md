# Organization isolation and deployment ownership

## Supported arrangements

The same code supports two deployment modes. Each deployment has its own database, API app registration, secrets and configuration.

| Mode | Configuration | Use |
| --- | --- | --- |
| Dedicated | `HELPDESK_DEPLOYMENT_MODE=dedicated` and `HELPDESK_ORGANIZATION_SLUG=hospital` | Hospital-owned Azure; only this organization's requests are accepted |
| Shared | `HELPDESK_DEPLOYMENT_MODE=shared` | Vendor-owned Azure; multiple explicitly onboarded organizations share a database |

Dedicated is the default. Missing organization slug or an unknown mode denies access. Shared mode does not allow arbitrary Entra tenants: the deployment owner must onboard each one. One organization maps to one Entra directory in this version; separate departments in the same directory are not separate tenants. Organization IDs are internal database IDs and are different from Microsoft Entra tenant IDs.

There is no automatic connection between separate deployments. Your hospital's database stays in its deployment. A separate shared deployment in your Azure contains only customers onboarded there. This feature is not a regulatory compliance certification; production hosting and data handling still require the hospital's approval.

## Data and request boundaries

Organizations store their name, unique slug, optional `entra_tenant_id`, trusted client IDs, status and optional access expiry. Users carry `organization_id`; an existing local account without an organization remains disabled by default and cannot access the API. Entra identity fields are optional so a different sign-in provider can be added later. Local/password authentication remains unimplemented.

Tickets, comments and application audit events carry a non-null `organization_id`. Queries, ticket route binding, policies, user administration and assignment validation enforce that boundary. Composite foreign keys reject tickets assigned to another organization's users and comments/audits linked across organizations even if HTTP validation is bypassed. The same email can exist in different organizations. Customer administrators, including Super Admins, only administer their own organization.

The API validates an Entra access token against its configured audience and the onboarded organization's tenant/client allowlist. The unsigned `tid` claim is used only to select an already-approved tenant and its fixed Microsoft signing-key endpoint. Signature, issuer, tenant, expiry, delegated scope and allowed client are then checked. Token claims never directly grant application roles. Unknown tenants are rejected without contacting their signing-key endpoints.

Microsoft's token names `tid` and `oid` are translated by the validator into application identity fields `tenant_id` and `entra_object_id`. Code outside token validation uses these explicit names. Organizations retain `entra_tenant_id` to distinguish their Microsoft directory from the internal `organization_id`.

Organization status and expiry are checked on every protected request, without caching access decisions. Only `active` or `trial` organizations with no expiry or a future expiry are admitted. `suspended`, `cancelled`, expired organizations and disabled users are denied. An existing token does not bypass this check. Requests already in progress may finish. Suspension retains records and does not prevent access to previously downloaded data.

These controls protect the Laravel API path. The SPFx preview still supports legacy SharePoint mode when both backend settings are blank. Organization suspension does not revoke direct SharePoint/Graph permissions or disable legacy deployments. Configure all customer entry points for Laravel, finish the remaining feature migration, and retire obsolete direct list access before relying on backend licensing controls for a production rollout.

Workflow services also check organization access when creating/updating tickets. Any future queue workers, exports, attachment downloads, cache keys, notifications or integrations must enforce organization access at execution time and keep organization-specific data separate. Those features are not automatically protected merely by adding an organization column.

## Initial configuration

The original helpdesk migration defines the organization-aware schema directly. No new migration chain was added. All migrations were applied to the Archways Digital local test database on 2026-11-13 after saving a backup; tests use separate temporary databases. For a configured installation:

```powershell
cd backend
composer install
Copy-Item .env.example .env
php artisan key:generate
php artisan migrate
```

Example hospital settings:

```dotenv
HELPDESK_DEPLOYMENT_MODE=dedicated
HELPDESK_ORGANIZATION_SLUG=hospital
ENTRA_API_CLIENT_ID=<this-deployment-api-client-guid>
CORS_ALLOWED_ORIGINS=https://hospital.sharepoint.com
```

For vendor hosting, use `HELPDESK_DEPLOYMENT_MODE=shared`; the pinned slug is ignored. Set `CORS_ALLOWED_ORIGINS` to the exact approved SharePoint origins, separated by commas. CORS is a browser control, not tenant authorization. `ENTRA_TENANT_ID`, `ENTRA_ALLOWED_CLIENT_IDS` and `HELPDESK_TITLE` are no longer used: those settings now live on organizations. The session title is the organization's name.

Dedicated deployments may use a single-tenant Entra API registration. A shared deployment serving external directories needs an API registration accepting accounts in organizational directories, with v2 access tokens. Every customer must approve the API permissions in its own tenant/SharePoint admin center. Use delegated scope `access_as_user`. The app registration does not automatically onboard a customer or provision its users. See [Microsoft's multitenant app guidance](https://learn.microsoft.com/en-us/entra/identity-platform/howto-convert-app-to-be-multi-tenant) and [token validation guidance](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens).

The SPFx web part still uses `https://<api-host>/api/v1` and `api://<api-client-id>`. No organization ID is selected or trusted from the browser; the backend resolves it from the verified Entra identity. Consent to Graph directory access is separate and is not introduced by this feature.

## Deployment-owner commands

These commands require access to the deployment console. They are not exposed through the customer API or Settings page. For vendor hosting, restrict console/deployment access to your operators. For hospital hosting, the hospital's deployment operators have that authority. The `--actor` value is an operator-supplied audit label, not an independently authenticated identity; restrict server access and retain infrastructure audit logs as well.

Onboard an organization with the customer's Entra tenant GUID and the application/client ID used by its SharePoint AadHttpClient. Supply `--client-id` more than once for multiple deliberately trusted clients. Do not use service principal object IDs. Depending on the tenant transition, the client may be named SharePoint Online Web Client Extensibility or SharePoint Online Client Extensibility Web Application Principal. Collect the application IDs present in the tenant and verify the actual client against the signed access token during integration; manage consent through SharePoint admin center API access.

```powershell
php artisan helpdesk:organization-create hospital "Hospital IT" <entra-tenant-guid> --client-id=<spfx-client-guid> --actor=operator@example.com
php artisan helpdesk:bootstrap-admin hospital <entra-user-object-guid> admin@hospital.example "First Admin"
```

Creation defaults to active with no expiry. Optional `--expires-at=2027-01-01T00:00:00Z` sets an expiry. Bootstrap is limited to the first user **per organization** and locks the organization row to serialize concurrent attempts. Customer administrators add further users through the existing Settings page. Profile/object IDs are not verified with Graph during provisioning; verify them before granting access.

Suspend and restore access:

```powershell
php artisan helpdesk:organization-access hospital --status=suspended --actor=operator@example.com --reason="Agreed suspension"
php artisan helpdesk:organization-access hospital --status=active --actor=operator@example.com --reason="Access restored"
```

Supported statuses are `trial`, `active`, `suspended` and `cancelled`. Restoring the status does not remove an existing expiry. Renew or remove expiry explicitly:

```powershell
php artisan helpdesk:organization-access hospital --expires-at=2027-01-01T00:00:00Z --actor=operator@example.com --reason="Renewal"
php artisan helpdesk:organization-access hospital --no-expiry --actor=operator@example.com --reason="No expiry agreed"
```

Replace trusted clients with `--client-id=<guid>` options on `organization-access`. At least one client is required when changing the list. Owner changes and their reason are recorded transactionally in `organization_events`; customer actions are recorded in organization-scoped `audit_events`. Billing integration, an owner web dashboard, automatic data deletion, a central cross-deployment administration service and licence-server callbacks are not implemented.

You control suspension for deployments you operate. A hospital controlling its own backend can change its configuration/database/code; this feature does not provide an unbypassable remote licensing mechanism. Availability, licensing and access to retained records need an agreed operating arrangement.

## Checks and deployment limits

```powershell
# From backend/
php vendor/phpunit/phpunit/phpunit
php vendor/laravel/pint/builds/pint --test
```

Tests cover two organizations, administrator isolation, scoped lists and direct routes, assignment restrictions, comment/audit boundaries, database constraints, token validation, per-organization trusted clients, dedicated mode, suspension/expiry/restoration, owner commands and per-organization bootstrap. Tests use SQLite in memory and fake Microsoft key discovery; live customer consent and PostgreSQL migrations still need staging verification.

Archways Digital was explicitly onboarded for local testing on 2026-11-13 using the supplied tenant/user/client identifiers. Its migration and local HTTPS setup are complete; see laravel-api-setup-guide.md for the current test connection. No Azure deployment or hospital production onboarding has been performed. Backups, data residency, monitoring, recovery procedures and required workflows must be validated for each production deployment.
