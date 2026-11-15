# Departments, ticket access and classifications

Organization is the outer customer boundary. Departments are application records inside it, rather than Entra groups or SharePoint folders. A user can be a member of several departments. Laravel applies the department boundary to ticket listing, comments/history, updates, assignment and first-response tracking, even for direct API calls.

## Roles translated from the existing application

The source rules are `interfaces/IRoleManagement.ts`, `services/appRoleRules.ts` and `pages/SharePointRolesPage.tsx`. The existing scope names are retained. The default agent scope uses the user's requested `assignedOrCreated` rather than the original configuration factory's `assigned`.

- User (stored role ID `requester` for compatibility): tickets requested or created by them within accessible departments. Fixed create/view/comment permissions.
- Agent: assigned to them or created by them by default. Admins can configure `assigned`, `assignedOrCreated`, `newUnassigned` or `all`, and the supported action switches, per department.
- Admin: all tickets in their departments by default, never every department merely because the global user role is Admin. Can configure Agent/Admin permissions in their own departments. With the aggregated Manage users permission, can add staff, change roles and activate/deactivate staff across departments under their management. Cannot change Super Admins or their own access, grant user-management authority, or manage organization-wide shared classifications.
- Super Admin: all departments and tickets within their organization, including unallocated tickets during setup. Does not bypass organization isolation, suspension or expiry.

Membership is required for department-scoped visibility and submission. Disabled departments grant no membership access. Newly created tickets automatically use the only accessible department; multiple available departments require a selection. A Super Admin may create an unallocated setup ticket only when no active departments exist. Normal ticket edits cannot move a ticket between departments. A controlled transfer workflow is not implemented.

The database stores `created_by_id` separately from `requester_id`. Current creation still uses the authenticated user for both; submitting for another requester is not yet exposed. The distinction is retained in visibility queries and API output. A requester alone does not qualify under agent `assignedOrCreated` scope. Agents can view/comment on created tickets without becoming their handling agent. Unassigned submissions start New; assigned submissions start In Progress. Agents cannot close/reopen terminal tickets or clear a resolution. Title/description changes require creator identity, except for Super Admins, matching the existing editor's restriction. Assignment on an agent-created ticket is allowed; other operations require department permissions and handling access.

The API returns per-ticket role rules for React's controls, while Laravel enforces the actual checks. Session actions are the union of department actions for general navigation, not a grant over every department. This port covers currently implemented ticket operations; FAQs, SLA, attachments, notifications and custom settings-page permissions remain separate work.

The original dev settings pages now consume these APIs through the shared `roleManagement` and `administration` interfaces, rather than replacement backend panels. Settings-page permissions for implemented sections are enforced by Laravel. Agents may change status on their submitted tickets and provide a resolution summary when resolving them, matching dev, without gaining first-response or priority privileges. See the [dev branch adaptation audit](dev-branch-adaptation-audit.md) for remaining feature ports and compatibility details.

## Tables and lookup relationships

- `departments`: organization, name, active flag, nullable role-settings JSON.
- `department_memberships`: organization, department, user. Multiple rows per user are allowed.
- `department_entra_groups`: organization, department, Entra group object ID.
- `categories`, `issue_types`: organization, name, active flag and ordering.
- `subcategories`: organization, category, name, active flag and ordering. Parent category cannot be reassigned through the management API.
- `category_departments`, `issue_type_departments`: selected departments where each lookup is available. No mapping rows means shared across all departments in that organization.
- Tickets: nullable department/category/subcategory/issue-type IDs and nullable description. Composite foreign keys prevent cross-organization lookups and mismatched subcategory parents when a category is supplied. Application validation also rejects a subcategory without its parent category.

Subcategories inherit their parent category's department availability. Lookup selections are optional. Active, permitted choices populate New Ticket and ticket-edit dropdowns. The API rejects unknown IDs, other organizations' IDs, department-inappropriate IDs, inactive new selections and incorrect category/subcategory pairs. Retired labels remain readable on existing tickets. Changing a category without specifying a subcategory clears the old subcategory. Deactivation is supported instead of deleting referenced records.

Admins can manage a lookup only when all of its mapped departments are under their management. Only Super Admins may edit shared lookups or their children. The existing dev classification table now creates options for the selected department; the API supports shared options and several selected department IDs. Shared mappings are owner-controlled. See the dev branch adaptation audit for the remaining UI integration work.

## Application-owned membership

DeskPilot creates departments and stores memberships in its own database. Entra provides sign-in and directory lookup only. Group claims, group mappings and cached group evidence do not grant department access or make an assignee eligible. Existing legacy mapping tables are retained without granting access; group-only users need explicit application membership. The department screen no longer offers group mappings, and the package no longer requests Group.ReadBasic.All.

**Manage users** combines adding members, changing roles, activation/deactivation and removal. It is enforced by Laravel and returned as department/per-user capability metadata so unauthorized actions are hidden. Only Super Admins can grant or revoke this authority; saved role settings remain authoritative, so a Super Admin must enable it once in existing department Administrator configurations. Roles and account enabled status are still organization-wide. Department Administrators can change a user only when they manage every department that user belongs to; otherwise a Super Admin must make the change. Per-department role/status overrides are not introduced in this update. Removing membership affects only the selected department.

## API and deployment

- `GET/POST /api/v1/departments`: accessible departments / owner-only creation.
- `GET/PATCH /api/v1/departments/{id}`: department roles, manual members and group mappings. Only Super Admins can save `member_ids` or `entra_group_ids`. Roles contain Agent/Admin `{name, scope, actions}` objects; requester rules are fixed.
- `GET/POST /api/v1/classifications/{kind}` and `PATCH /api/v1/classifications/{kind}/{id}`; kinds: `categories`, `subcategories`, `issue-types`. Input uses `name`, `active`, optional `sort_order`, `department_ids` (empty for shared) or `category_id` for a subcategory.
- `GET /api/v1/ticket-options`: accessible departments, lookup options, parent IDs and availability metadata.
- Ticket creation/edit uses `category`, `subcategory`, `issueType` as lookup IDs, not labels. Creation uses `departmentId`. ID fields are translated at the SPFx adapter boundary; API output includes readable labels and IDs.

The original migration is edited directly because the user explicitly chose a disposable test rebuild. No local/Azure application database was reset or migrated by these changes. Deploy a new backend image and SPFx package, rebuild the test database using Azure SQL-compatible SQL (not the broken `migrate:fresh` wipe), migrate, bootstrap organization/admin, then create departments and assign members before ordinary users test the app. Existing SharePoint lists, group mappings and role settings are not automatically imported. Existing databases require a deliberate migration strategy if their data must be retained.

The existing local SQLite database was subsequently upgraded on 2026-11-14 with `php tools/upgrade-local-sqlite.php`. This tool snapshots the database under ignored `storage/app/private/setup-backups`, creates the current schema in a separate SQLite file, copies existing records with row-count and foreign-key checks, then replaces the live schema in a transaction. It refuses production, Azure and other database files. The legacy local workspace received a default Helpdesk department containing its existing users and tickets; creator IDs were backfilled from requester IDs. Azure was not modified. The local HTTPS health endpoint returned 200 after the upgrade.

Tests use isolated SQLite databases and mocked Entra signing keys/identities. They verify API behavior and relational constraints, but do not replace Azure SQL/PostgreSQL integration testing after deployment.
