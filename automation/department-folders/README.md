# SharePoint-only department rollout (UGMC IT)

## What is implemented locally

- SharePoint role groups are the role source: DeskPilot Helpdesk Administrator, DeskPilot Agents, DeskPilot Requesters, in that precedence order. Direct user membership is supported. Site owners remain Super Admins. An existing per-user projection can still supply customized role rules; group-only users receive default rules and the published workspace metadata, never other people's access records.
- Requesters can create, list and comment on their own requests, and read published KB. Their identity is matched by RequestedBy or requester email, not just the record's creator.
- Optional secured creation writes tickets directly into `Departments/<key>/Requesters/<SharePoint user ID>`. Comments go into the matching folder in TicketComments. Inaccessible/unprovisioned destinations fail; there is no unsecured-root fallback. Ticket and comment attachments stay on their parent item and inherit its ACL.
- Visible ticket-list/dashboard screens check every 30 seconds and on returning to the window, without replacing the screen with a loading state. Creation and ticket-detail screens do not poll; open drafts and modal state are not reset. This is polling, not instant server push, and it does not run when the app is closed.
- No desktop-install UI is included. Users can use their browser's installed-site option themselves; no service worker is installed on the SharePoint origin.

## Permissions to review before activation

One department folder alone would expose every department request to all department members. Requester subfolders are necessary for the selected privacy model. Support access is granted to dedicated SharePoint groups (`DeskPilot UGMC IT Agent` and `DeskPilot UGMC IT Admin`), not to the whole UGMC IT tenant group. SharePoint permissions are additive: placing a global Agents group and a department group on a folder is OR, not AND.

The approved CSV is the explicit intersection of department membership and DeskPilot role. It is not an automatic directory sync. Export/verify it against the UGMC IT tenant group and keep it current. A group display name is not proof of membership; no directory group was resolved or changed from this development environment.

The script grants a Contribute-derived role with Delete Items/Delete Versions removed within authorized folders. SharePoint does not provide per-column write permissions: users with Edit Items could change their own item's fields directly outside DeskPilot. DeskPilot's role guard prevents status/assignment changes in the application, not through arbitrary direct SharePoint calls. Strict field-level enforcement needs a trusted write gateway or a different permission/workflow design. Do not treat UI role checks as that gateway.

Folder counts grow with requesters multiplied by departments and lists. Review SharePoint permission-scope limits before an organization-wide rollout. Revoke old direct grants and sharing links as part of migration. Site collection administrators remain privileged.

## Safe staging procedure

1. Deploy the package to a test site, open it as an owner and initialize its normal lists/access groups. Use empty, schema-complete Tickets and TicketComments lists. Existing production records are not moved by this script.
2. Connect PnP.PowerShell separately as a site owner using your organization's approved client ID. The script does not install tooling, authenticate, request consent or embed credentials.
3. Replace `roster.example.csv` with approved user logins and Requester/Agent/Admin roles for UGMC IT. Do not use the example identities.
4. Preview without any tenant writes:

   ```powershell
   ./automation/department-folders/Initialize-DepartmentFolders.ps1 -SiteUrl 'https://ugedugh.sharepoint.com/sites/issuetracker' -RosterCsv './approved-ugmc-it.csv'
   ```

5. Review the script and roster. In the staging site, run with `-Apply` to create protected folders and output a policy JSON. Roots are restricted to owners; department folders grant only the dedicated support groups; requester folders additionally grant the individual requester. Existing non-folder records cause the script to stop. It never changes the parent site's memberships/permissions or clears existing ticket subscopes.
6. Inspect the resulting ACLs. Test requester A, requester B, an IT agent, an unrelated-department agent and an owner against direct list-item URLs, comments, attachments, Graph access and DeskPilot. Requester A must not read B's folder or records.
7. `-Apply -Activate` also stores the policy and list bindings in the private DeskPilot configuration. Open DeskPilot as a site owner afterward to publish workspace metadata/projections, then reload other users. Groups without an access projection require that published workspace metadata.
8. Add each new requester to the approved roster and provision their personal folders before they submit. Existing items and former memberships are not migrated/revoked by this initializer. A separate reviewed migration/revocation is needed for production history.
9. Configure email/Power Automate creation to use the same secured destination and matching requester identity. Root creation is intentionally inaccessible to ordinary staff. Do not create at a broadly accessible root and move afterward.

The script is an initial provisioning tool, not an ongoing authoritative roster synchronizer. Test it in a disposable site first; local tests do not verify tenant ACLs or PnP behavior.

## Moving sites

Runtime API roots use the active SharePoint site. Do not copy a folder policy containing old server-relative paths to a different site: reprovision folders and regenerate the policy there. Existing installed-site shortcuts need the new URL. Move/migrate data only after checking destination permissions.

## Still required for production

An approved roster, staging list bindings, tenant permission verification and a reviewed migration of existing tickets/comments. No live ACLs, directory memberships, hosting resources or Power Automate flows were changed by this implementation. The department policy remains inactive until an owner activates it.
