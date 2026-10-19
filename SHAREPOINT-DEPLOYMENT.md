# DeskPilot: SharePoint full-page deployment

DeskPilot now has a SharePoint-native host for the current shared interface and Microsoft Graph data services. It uses the signed-in SharePoint user, the current site's URL, and web-part configuration rather than Azure `.env.local` files. The existing standalone folder is retained as a fallback; it is not required to run this host.

## Build and deploy

1. In a terminal opened at `D:\Dev\CustomApps\spfx-helpdesk` (the repository root, not `azure-app`), run `npm run build`.
2. Upload the package through the **SharePoint App Catalog**, not the Microsoft 365 Apps launcher or SharePoint Store:
   - Sign in with a **SharePoint Administrator** or **Global Administrator** account. The DeskPilot Super Admin app role does not grant these Microsoft 365 administrator permissions.
   - Open [your SharePoint admin center](https://archwaysdigitalgh-admin.sharepoint.com).
   - In the left menu, choose **More features**. Find **Apps** and select **Open**. This opens the organization's Apps site / App Catalog and its **Manage apps** page. If prompted to create an App Catalog, a SharePoint administrator must complete that setup first.
   - On **Manage apps**, select **Upload**, not Add app. Choose `D:\Dev\CustomApps\spfx-helpdesk\sharepoint\solution\spfx-helpdesk.sppkg`. You can also drag that file into the apps library. In the classic catalog interface, open **Apps for SharePoint** and use **Upload** there.
   - Replace the existing package if prompted. In the deployment panel, select **Enable app** / **Deploy**, depending on the interface. If you choose **Enable this app and add it to all sites** (older wording: **Make this solution available to all sites in the organization**), its web part becomes available without installing it separately on each site. This makes the component available; it does not give users access to department data.
   - If you enable it without making it available to all sites, visit the department site and open **Settings > Site contents > New > App** (or **Settings > Add an app**). Under **From your organization**, select the uploaded DeskPilot solution and add it. Its catalog name may be `deskpilot-client-side-solution`; the web-part picker name is **DeskPilot**.
   - If **Upload** is missing, check that you are on the App Catalog's **Manage apps** page and that your account has permission to manage the catalog. Being an owner of the IT helpdesk site alone does not grant catalog upload rights.

   Microsoft reference: [Manage apps using the Apps site](https://learn.microsoft.com/en-us/sharepoint/use-app-catalog).
3. A tenant administrator must approve the package's pending API requests in **SharePoint admin center > Advanced > API access**:
   - Microsoft Graph: `Sites.Manage.All` for list data and schema operations.
   - Microsoft Graph: `User.Read.All` for organization user search.
   - Office 365 SharePoint Online: `AllSites.Manage` for SharePoint metadata, person resolution, attachments and list setup.
   These are delegated permissions: the signed-in user's SharePoint permissions still limit operations. These approvals belong to the SPFx API principal, not the standalone DeskPilot Entra registration. They are tenant-level approvals; review them accordingly.
4. On the department site, create a modern page named **DeskPilot**, add only the **DeskPilot** web part, and configure its Tickets list name as **Issue Tracker**. An optional list ID takes precedence over the name. Set **Workspace title (beside DeskPilot)** to the department's preferred heading, such as **HR Helpdesk** or **Facilities Support**. Leaving it blank uses **IT Helpdesk**. This title is stored on this web part's page, so each department site can use a different title with the same package. Publish the page.
5. Convert the page to an app page using PnP PowerShell, signed in through an organization-approved Entra client ID. Use the actual page file name shown in Site Pages:

   ```powershell
   Connect-PnPOnline -Url 'https://archwaysdigitalgh.sharepoint.com/sites/ithelpdesk' -Interactive -ClientId '<your-approved-PnP-client-id>'
   Set-PnPPage -Identity 'DeskPilot.aspx' -LayoutType SingleWebPartAppPage
   ```

   PnP PowerShell is separate administration tooling, not an application runtime dependency. If the SharePoint **New > Page** picker offers DeskPilot under Apps, you can create the app page directly instead.
6. Open `https://archwaysdigitalgh.sharepoint.com/sites/ithelpdesk/SitePages/DeskPilot.aspx`. Verify this published page, not the workbench: full-page mode removes the normal page command bar containing New, Page details and publishing/editing commands. App-page composition is locked; to change web-part settings later, temporarily restore the layout with `Set-PnPPage -Identity 'DeskPilot.aspx' -LayoutType Article`, edit and republish, then convert back.
7. To hide the site's own navigation, open **Settings > Change the look > Navigation**, switch **Site navigation visibility** off and save. This affects the whole site. You can optionally make DeskPilot the site's home page using Site Pages > Make homepage.

The Microsoft 365 top bar and the SharePoint Discover/Publish/Build app bar are separate host controls. Full-page mode removes the page command bar, not those global controls. To open DeskPilot with the surrounding SharePoint headers and navigation hidden, use this launch link:

```text
https://archwaysdigitalgh.sharepoint.com/sites/ithelpdesk/SitePages/DeskPilot.aspx?env=WebView
```

After verifying this view in your tenant, use this URL for bookmarks and links that launch DeskPilot. This is a URL-based display mode; it does not change site permissions or permanently hide navigation throughout the site. Remove `?env=WebView` to return to the normal SharePoint view. If the URL already has query parameters, append `&env=WebView` instead.

Use `env=WebView` for the DeskPilot page. `env=WebViewList` is intended for the Microsoft Lists experience when applied to list URLs. Microsoft’s [community guidance on URL query parameters](https://learn.microsoft.com/en-us/microsoft-365/community/query-string-url-tricks-sharepoint-m365) describes these modes; this is community guidance rather than a formal compatibility guarantee. This solution does not inject CSS or manipulate SharePoint's DOM to hide host controls.

## Departments

Deploy the same package on each department site and create a DeskPilot app page there. The host automatically uses the current site's URL. Configure that site's Tickets list name/ID in its web part; the supporting list names are FAQs, Ticket Categories, Ticket Subcategories, Ticket Issue Types and Ticket Priorities. Their data remains separate by site. No environment-file switching or Node.js API process is needed for this host.

## Security and differences from the standalone host

Every data request uses delegated Microsoft 365 authentication. SharePoint enforces site/list/item permissions even if someone bypasses the interface. DeskPilot now has site-local app roles configured under **Users & roles**. The standalone app's Entra role assignments are not imported or used by this host. Per-list administration services also check SharePoint list permissions.

### Set up users and role rules

1. After replacing and deploying the package, open the DeskPilot page as a SharePoint site owner. The app recognizes users with both Manage Web and Manage Permissions as **Super Admin**. SharePoint Members with ordinary Edit permissions no longer automatically become app administrators.
2. Open the **Users & roles** main tab, then its **Users** subtab. Use **All Users / Agents / Helpdesk Admins**, search, department and status filters to review assignments. Click **Add users** to open the organization search popup, choose **Helpdesk Admin** or **Agent**, select one or more people, then click **Add users** inside the popup to save. Assignments are for this department site only. Users without an active assignment cannot open DeskPilot; site owners retain Super Admin access. Existing users appear as Already added in the popup; change their role through the row's Actions menu.
3. Open the **Roles & Permissions** subtab to review **Role Permissions**. Select Agent or Helpdesk Admin; permissions appear read-only, grouped into Ticket visibility, Page access, Ticket permissions and Administration permissions. Permissions appear in one continuous table using the same title, subtabs and table styling as Tickets, with category header rows and Allowed/Not allowed switches. Select **Edit permissions** to change switches or the single selected ticket view, then **Apply changes**. Review the changes in the confirmation dialog and select **Confirm apply** to save. **Cancel editing** discards the permission draft. **Restore defaults** previews and confirms restoring only the selected role; user assignments and other roles are preserved. The default Agent view shows assigned tickets; Helpdesk Admin shows all accessible tickets. Schema changes, initial SLA setup and role management remain restricted to Super Admin.
4. User additions save from the popup; role changes, activation/deactivation and removal save after confirmation from the row Actions menu. Selected rows can be removed together after confirmation. Active/Inactive describes the DeskPilot assignment, not the user's Microsoft 365 account. Department and date added are recorded for new assignments; older records without those values show a dash. Initial saving creates a **DeskPilot Access** list with unique permissions and a single configuration item. To initialize without adding users, confirm **Restore defaults** for a role. The creating site owner and associated Owners group alone can read and edit the private configuration. The same hidden DeskPilot Access list contains one private Configuration item and one uniquely secured item for each active user. Each item has unique permissions: only that user has Read access, while site owners retain Full Control. Disabled or removed users have their access items deleted. Do not grant ordinary users edit rights to this list or its configuration item, or restore inherited permissions. If initial setup is interrupted before the configuration item is created, the owner can reopen the screen and retry saving.
5. Separately grant the users access to the site, published DeskPilot page and relevant lists. Assigning an app role grants Read access to the access-configuration list only; it does not grant ticket, FAQ or classification data access. FAQ/list/SLA management still requires sufficient SharePoint permissions on those lists.
6. Ask affected users to refresh DeskPilot. Rules are loaded at startup; open sessions retain their previous interface rules until refreshed. Removing an app assignment does not revoke existing SharePoint data permissions or the user's Read access to the configuration list. Use SharePoint permissions when immediate data-access revocation is required.

Role rules hide pages and disable actions in the app, guard normal app service calls, and filter returned tickets for the selected view. These are client-side controls, not a replacement for SharePoint permissions or the Azure backend's authorization policies. Configuration save conflicts require reloading before another save.

The Node.js API's custom app-role policies do not run in SharePoint. In particular, filtering a view to assigned tickets does not enforce an assigned-only security policy. Users with list-wide read/edit permission can still read/edit that data through Microsoft APIs or Lists. Before granting agents production access, configure and verify appropriate SharePoint item permissions if they must be restricted to particular tickets. SharePoint's ordinary created-by item settings do not implement assigned-to access. Automatic assignment-based permission provisioning is not implemented here.

Entra Users and Roles management is not exposed in this serverless host. Manage any retained standalone app assignments in Entra's portal. SharePoint-hosted DeskPilot assignments are managed inside DeskPilot as described above. A tenant-wide super-admin workspace switcher is not implemented; use each department site's page and SharePoint permissions.

Do not upload `.env.local`, client secrets or the Node.js server to SharePoint. Existing Azure app registrations and credentials are not deleted by this migration. Review whether they are still needed after tenant acceptance testing.

## Acceptance checks

Test the published app page with a site owner and a restricted user. Check ticket creation/editing, assignment search, attachments, comments, FAQs, classification administration and SLA setup. Verify denied access against the actual SharePoint lists/items. Check a second department site to ensure it uses its own lists. A successful local build does not verify tenant API consent, permissions or SharePoint's rendered page controls.

Repeat the relevant checks using the `?env=WebView` launch link. Verify that the surrounding headers and navigation are hidden, DeskPilot menus and dialogs remain usable, and refreshes and links preserve the intended display mode. Keep the normal page URL available for administration and as a fallback.

Check that Administration opens its first available subtab and that active subtabs use a bottom border on white. DeskPilot's account button loads the actual photo from Microsoft Graph and falls back to initials if the photo is absent or unavailable. Verify the border-only avatar, wrapped email and View account / My profile links. Test Sign in with another account and Sign out against the tenant's SharePoint session pages; account switching and sign-out affect the shared Microsoft 365 browser session, not just DeskPilot.

Initialize and test **Users & roles** with a site owner, a Helpdesk Admin, an Agent and an unassigned user. Verify unassigned-user denial, checkbox-controlled pages/actions, assigned/own/all ticket views, denied access outside the selected app view, and denial of configuration writes by ordinary site members. Check the actual SharePoint permissions on DeskPilot Access, ticket items and supporting lists. Test simultaneous owner edits (the stale save must fail), refresh after a role change, and role isolation on a second site. Local checks: `node --test tests/sharepoint-roles.test.mjs` and `npm run build`; these do not validate tenant REST behavior or deployed ACLs.

References: [Full-page apps](https://support.microsoft.com/en-us/sharepoint/sites-pages/create-a-full-page-app-in-sharepoint), [SPFx app pages](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/web-parts/single-part-app-pages), [API access approval](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/use-aad-tutorial).

## Private configuration and user access in one list

DeskPilot Access is the only active configuration/access list on each department site. Its Configuration item stores the complete settings and assignments and is restricted to site owners (the SPFx Super Admin authority). Other items use the SharePoint user ID as their Title and store only that user's assignment and effective role. Each user item has unique permissions: that user receives Read, while site owners retain Full Control. Ordinary users cannot read the Configuration item or other users' entries, even through direct list URLs or APIs. The list remains hidden from normal listings and Quick Launch; item permissions provide the security.

After uploading the updated package, open DeskPilot once as a site owner before ordinary users reconnect. Existing assignments are regenerated as private user items inside DeskPilot Access. If the former DeskPilot User Access list exists, the app restricts it and all its old items to owners after successfully provisioning the replacement entries. It does not delete that old list automatically; it is retained only for recovery and is no longer read by the app. After verifying migration with ordinary accounts, a site owner can delete the obsolete list through SharePoint.

New installations create only DeskPilot Access. Role changes update user items; disabling/removing a user deletes their item while preserving the Configuration item. If migration or saving fails midway, reopen as a site owner to retry from the saved configuration. SharePoint site collection administrators and users with privileged permission-management rights remain administrative exceptions. Existing browser sessions need a reload to apply changed app rules; ticket permissions remain separate.

Validate with two ordinary accounts: each must be able to read only their own item. Requests for the Configuration item and the other user's item must be denied. Run `node tests/privateAccess.cjs` and `node tests/sharepoint-roles.test.mjs` for local checks; actual tenant ACL behavior must also be verified after deployment.
## Super admin settings menu

A settings gear beside the profile appears only for Super Admins in the SharePoint host. Page view links open the current page with SharePoint controls or with env=WebView while preserving other query parameters. SharePoint links open the site home, Site contents and Site settings. Hidden lists are fetched from the current site whenever the menu opens, including DeskPilot Access and system lists accessible to the signed-in administrator. Entries open each list's default view, with a list-settings fallback where no view is available. These links do not grant permissions. An obsolete DeskPilot User Access list may appear until an owner deletes the retired list after verifying migration.


## Simple Settings console

Super Admins can choose the Settings gear directly. The sidebar contains General, SharePoint settings, Application lists, Documents, and Hidden lists. General saves the workspace display name, support description, and validated ticket-list binding in the existing private Configuration item. These non-secret workspace values are copied into private user entries so all assigned users use the same binding; web-part properties remain the initial fallback until settings are saved. This does not rename the SharePoint site or move ticket data. Saving asks for confirmation and reloads the app.

SharePoint settings provides native site links and normal/WebView launch links. Application lists shows DeskPilot resources and separates the retired access list. Documents browses visible document libraries and folders and opens files in a new tab; creation, upload and other document-management operations stay in SharePoint. Hidden lists separates DeskPilot resources from other system lists. Existing Users & Roles, schema, classification, FAQ and SLA screens remain unchanged. Verify General saving and the document browser on the deployed site; local builds cannot confirm tenant REST behavior.



Ticket Type is a separate Choice column from Issue Type. After deployment, a Super Admin can open Settings > General > Add Ticket Type field and confirm creation. Its internal name is TicketType and choices are Problem, Incident, Question, Request. Existing tickets are preserved without assigning an invented type. The field then appears in creation, editing, details and the Tickets column selector. If the column already exists, manage its choices through Ticket list schema instead.


## Initialize a fresh workspace

A Super Admin can open Settings > General (or Application lists) > Initialize workspace. First inspect the review table. It identifies existing resources, missing lists/columns, choices to append and blocking conflicts. Confirm initialize only after reviewing the plan. The popup reports progress and retains completed changes if a request fails. Select Review again to retry remaining steps; creation is never automatically retried after a lost response.

Setup creates DeskPilot's Tickets list (the configured name), Ticket Categories, Ticket Subcategories, Ticket Issue Types, Ticket Priorities and FAQs. Categories are created before dependent lookup columns. Ticket Type is a Choice column with Problem, Incident, Question and Request; issue types remain independent. New ticket statuses/defaults and priority defaults are configured, missing priorities are seeded with initial elapsed-time SLA targets, and FirstRespondedAt/ResolvedAt are created. No sample classification or FAQ records are added. Existing data and targets are preserved. Compatible legacy text/choice ticket classifications are retained rather than converted to lookups. Wrong types, multiple-person columns and wrong lookup parents block setup for manual review.

Finally the existing SharePoint role service initializes/secures DeskPilot Access and stores resource IDs with the workspace settings. Supporting services use these IDs after reload, falling back to centralized names before initialization. An explicit configured ID that is unavailable blocks setup instead of creating another list. Confirm permissions and correct stale bindings first. A missing-list notice routes Super Admins to Settings; ordinary users cannot run provisioning. Microsoft Graph delegated Sites.Manage.All and the operator's actual SharePoint list-management rights are required. Securing configuration also requires permission-management rights. Newly created operational lists inherit the site's permissions; setup does not implement assigned-ticket ACL automation. Review site access before admitting ordinary users.

After successful setup choose Reload DeskPilot. The app does not create site collections, Forms, Power Automate flows, document libraries, arbitrary unrelated lists or Entra roles. Existing lists are never deleted. Provisioning is multi-request and not transactional. If the final configuration step fails, created lists remain; reopen as a site owner and review/retry. Local checks: node tests/workspaceSetup.cjs, node tests/privateAccess.cjs, node tests/sharepoint-roles.test.mjs and npm run build. Verify actual column types, lookups, attachments and ACLs in the tenant after deployment.

### Setup defaults and default Tickets view

The default list name for new workspaces is Tickets; existing explicit list bindings are preserved. Initialization leaves new Categories and Subcategories lists empty and preserves existing entries. It does not seed General entries. Ticket Type is part of initialization, so its separate Add Ticket Type button has been removed.

The review includes arranging the default SharePoint Tickets view: Title, Status, Priority, Ticket Type, Issue Category, Issue Subcategory, Issue Type, Assigned To, Expected Resolution Date, First Responded At, Resolved At, Closed At, Resolution Summary, Related Issue, Created, Created By, Modified By. Related Issue is a single lookup back to Tickets. Created/Created By/Modified By use SharePoint's built-in Created/Author/Editor fields; they are not duplicate custom columns. Extra existing view fields remain afterward. These view changes run only when initialization is confirmed; the app table's personal column selection remains separate.

Completed At is a legacy alias for Resolved At. DeskPilot prefers the canonical ResolvedAt column when present. Setup never deletes or migrates either column's data. Before manually deleting Completed At, reconcile timestamps and update any Forms/flows/views referring to it.

### Advanced workspace maintenance

User assignments save DeskPilot roles only. Automatic site-group and ticket-permission synchronization has been removed, including the Sync SharePoint access action and its assigned-ticket creation restriction. SharePoint site/list access must be managed separately. Open the published DeskPilot page URL directly; the site's root URL may point to a different page.

If the removed synchronization feature was already run on a live site, deploying this rollback does not restore its previous permission inheritance, role settings or group membership. No original SharePoint ACL snapshot was stored, so automatically restoring inheritance could expose private tickets. A site owner must review those existing permissions separately. If Agent creation was disabled in the saved DeskPilot role, re-enable it through Roles & Permissions when appropriate; existing SharePoint permissions still determine whether creation succeeds.

Super Admins can open Settings > Site Lists > Advanced workspace maintenance. This section starts collapsed and shows its actions vertically when expanded. Select the operational lists explicitly, review the site, list names and item counts in the confirmation modal, then type the exact confirmation text:

- `CLEAR LIST ITEMS`: recycle every item (including attachments) in the selected lists; keep their columns and saved bindings.
- `DELETE APPLICATION LISTS`: recycle the selected lists and clear their saved list IDs.
- `RESET LIST BINDINGS`: clear all saved resource IDs without deleting any lists or records. Use this when a fresh site has unavailable saved IDs, then reload DeskPilot and run Initialize workspace.

The maintenance service rechecks SharePoint Manage Web and Manage Permissions, resolves targets on the current site, and rejects changed list reviews before writing. SharePoint enforces the actual delegated operation permissions and retention restrictions. Documents, hidden/system lists, DeskPilot Access and DeskPilot User Access are excluded. User roles and access configuration are preserved. These operations are multi-request and may partially complete: on failure, reload and review the remaining resources. Recovery is through SharePoint's recycle bin and depends on retention and permissions. No operation is executed merely by opening the maintenance panel. Validate locally with `node tests/workspaceMaintenance.cjs`.
