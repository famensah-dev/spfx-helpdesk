# DeskPilot Azure App Setup Instructions


## SLA & Priorities

Open **Administration > SLA & Priorities**. The table starts with the configured Tickets Priority choices and shows whether each has response and resolution targets.

### Initial setup

1. Complete the administration consent above: delegated Graph **Sites.Manage.All**, the selected-site write grant, SharePoint **AllSites.Write**, and **Manage Lists** on the Tickets list.
2. Click **Set up SLA tracking** and confirm. DeskPilot creates **Ticket Priorities** on the same configured site, with **Title** (priority name), **ResponseMinutes** (Number), **ResolutionMinutes** (Number), and **Active** (Yes/No). It adds writable **FirstRespondedAt** and **ResolvedAt** Date and Time columns to Tickets if missing. Setup can be retried after a partial failure without intentionally recreating existing fields or lists. It copies existing Tickets Priority choices into Ticket Priorities without assigning SLA targets or replacing existing entries. It never backfills ticket timestamps. Use **Sync priorities** to populate a list created before this update, or to copy choices added directly in Lists.
3. In SharePoint list permissions for **Ticket Priorities**, stop inheriting permissions and restrict edit/manage rights to your helpdesk administrator group. Give dashboard readers Read access. Do this before using the policy list in production: inherited Contribute/Edit rights otherwise allow direct edits outside DeskPilot. Administrators need Manage Lists on both Tickets and Ticket Priorities; the app checks these permissions on administration reads and every save, and Microsoft 365 enforces the actual list grants.
4. Edit each priority to enter positive whole-minute targets. For example, 60 minutes means one hour; 1440 means one day. Resolution must be at least as long as response. No target values are assumed for existing priorities.
5. **New** adds a priority and its targets. Its name is also appended to the actual Tickets Priority Choice column, so it is available in new-ticket, ticket-edit, and inline-priority selectors. Existing names are permanent here to preserve historical ticket references. If a save partially succeeds, refresh before retrying; the service reuses an existing matching policy rather than intentionally creating a duplicate.
6. **SLA tracking: Disabled** excludes that policy from SLA scoring but keeps its priority selectable on tickets. Saving targets and setup both require confirmation.

### How timing is recorded and scored

- This version uses **24/7 elapsed time** from the ticket's Created timestamp, including weekends and time on hold. It does not implement business hours, holidays, escalation notifications, or pause rules.
- Support staff use **Record first response** in ticket details immediately after responding. Confirmation records the current UTC timestamp once in FirstRespondedAt. A version guard prevents concurrent requests from overwriting an existing first-response time. Merely assigning a ticket, opening it, or posting an arbitrary comment does not count as a response. Responses outside DeskPilot require this action or an external automation that writes the timestamp.
- Moving a ticket from an open status to Resolved, Completed, or Closed through DeskPilot records ResolvedAt in the same update as its status. Re-saving a terminal status does not invent a missing historical timestamp. Reopening clears ResolvedAt, and resolving again records the new resolution. A status change made directly in Lists requires automation or a manual timestamp update outside this app.
- The dashboard's **SLA performance** card follows its date, department and ticket filters. It shows response and resolution separately: **Met**, **Breached**, **Within target**, **Unknown**, and **Not configured**, plus up to six tickets that missed a target. Archived tickets are excluded. Boundary timestamps exactly at the target count as Met; an unfinished ticket exactly at its deadline remains Within target.
- Completed tickets without reliable timestamps are Unknown. Missing tracking columns or invalid timestamps are also Unknown. Open tickets without a recorded event are treated as still awaiting it. Record actual responses consistently to avoid false response breaches. No Modified-date estimates are used.
- Calculations use **current priority and current SLA targets**, including for historical tickets. This is an operational dashboard, not an immutable SLA audit ledger: changing a priority or target can change past scores. Policy snapshots, business calendars, and a resolution history would be needed for immutable historical reporting.
- Refresh reloads data; the SLA clock recalculates once per minute while the dashboard is open. New target saves refresh ticket mappings and dashboard data.

## Administration: Tickets schema and classification lists

The **Administration** tab now has separate pages for **Ticket list schema**, **Categories**, **Subcategories**, **Issue Types**, **SLA & Priorities**, and the existing FAQ manager.

### Authorize administrators

1. In SharePoint, give the intended helpdesk administrators **Manage Lists** permission on the Tickets list and the three classification lists. This is included in permission levels such as Design and Full Control; use an appropriate administrator group for your organization. Regular ticket-item edit permission is insufficient for Administration.
2. Restrict editing of Ticket Categories, Ticket Subcategories, and Ticket Issue Types in SharePoint to that administrator group. Other users can retain read permission so they can select classifications. These underlying list permissions enforce access even if someone calls Graph outside DeskPilot.
3. Keep the existing Microsoft Graph delegated **Sites.Selected** permission and selected-site Write grant for classification-item changes and ticket operations.
4. For ticket-column/schema operations, in **Entra admin center > App registrations > DeskPilot > API permissions**, add **Microsoft Graph > Delegated permissions > Sites.Manage.All**, then have a tenant administrator grant consent. Microsoft Graph's list-column creation API documents this permission. This is a broader delegated permission across sites the signed-in user can manage, not a site-limited grant; review it with your tenant administrator. DeskPilot requests it separately for schema administration, rather than adding it to normal ticket sign-in scopes.
5. Keep the existing **SharePoint > Delegated > AllSites.Write** consent for metadata and effective-permission checks. It does not grant your account Manage Lists. Both your user permissions and the API's authorization rules apply.
6. Sign out and back in after consent changes. Opening the schema page may initiate the additional schema permission sign-in; complete it and reopen Administration before entering changes. No secrets or new environment variables are needed.

Every administration write checks the signed-in user's effective **Manage Lists** permission on the target list. Actual requests then go to Graph, where Microsoft 365 enforces delegated and list permissions. DeskPilot cannot grant itself or its users administrator rights. A hidden/disabled button alone is not the access boundary.

### Ticket list schema

This page reads **columns and column metadata only**; it does not retrieve or display ticket records through the administration data service.

- The table shows display/internal names, type, description, required state, and available actions. **View** opens all Graph column properties, including type settings and flags.
- **New column** supports Single line of text, Multiple lines of text, Number, Choice, Date and time, Yes/No, Person or group, and Lookup. Type-specific controls cover text length, rich text, numeric bounds/precision, choice values, date-only mode, people/groups and multiple selection, and lookup source list/column.
- Use a permanent internal name of 1–64 letters, digits, or underscores starting with a letter. The app validates duplicate names and type settings before sending the create request.
- **Edit** updates supported display name, description, and required properties. Internal names and existing data types are preserved. Converting a populated column to another type requires a separately planned migration; the form does not attempt implicit conversion.
- Read-only, sealed, missing-metadata, and system-managed fields are protected. SharePoint field metadata determines deletion eligibility; built-in and core ticket fields cannot be deleted here.
- Deleting an eligible custom column requires typing its internal name. Deletion removes stored values and can affect workflows/reports; review dependencies and back up first. SharePoint can still reject a change for content-type, lookup, or field restrictions; DeskPilot displays that error.
- Creating an extra column does not automatically add a new custom field to the operational ticket form. Operational fields still follow DeskPilot's supported mappings.

Schema changes invalidate DeskPilot's ticket-schema cache so subsequent ticket operations re-read their mappings. No ticket records are created, changed, or deleted by this page.

### Classification administration

- **Categories:** view/add/edit names, activate/deactivate entries, and change Sort order.
- **Subcategories:** the same controls plus a required parent Category selector backed by its existing single SharePoint lookup. The app verifies the lookup points to Ticket Categories and saves the numeric parent ID.
- **Issue Types:** the same name, Active, and Sort order controls, with no category/subcategory parent requirement.
- Lower Sort order values appear first; ties sort alphabetically. Deactivation preserves existing ticket references while removing entries from new selections. Configuration changes are persisted to their respective lists and picked up when ticket forms reload their options.

### Live verification

1. Open each Administration page as an authorized administrator and verify its list name and metadata.
2. Create a temporary custom Tickets column, edit its display name/description/required flag, verify in SharePoint, and delete it with confirmation. Confirm built-in/system deletion is disabled.
3. Add and edit a category, a child subcategory, and an independent issue type; change Active and Sort order, reload, and confirm persistence.
4. Open New ticket and verify the saved classification options and parent filtering.
5. Sign in as a non-admin: Administration must deny access. Verify direct schema/configuration writes are denied by Microsoft 365 according to the list permissions configured above.

The implementation does not change tenant consent or SharePoint permissions automatically. Live schema and permission verification require your authenticated tenant; automated tests and a successful build are not a substitute.

[Microsoft Graph create-list-column permission requirements](https://learn.microsoft.com/en-us/graph/api/list-post-columns?view=graph-rest-1.0) · [Column definition properties and restrictions](https://learn.microsoft.com/en-us/graph/api/resources/columndefinition?view=graph-rest-1.0)

## Classification lists: Categories, Subcategories, and Issue Types

Ticket creation and editing now load classification from these lists on the configured ticket site:

| List | Required columns |
|---|---|
| Ticket Categories | Title (text), Active (Yes/No), SortOrder (number) |
| Ticket Subcategories | Title (text), Active (Yes/No), SortOrder (number), Category (single lookup to Ticket Categories) |
| Ticket Issue Types | Title (text), Active (Yes/No), SortOrder (number); no parent lookup required |

An optional Description column is fine. Display name **Sort Order** is also recognized. The app retrieves real column internal names and verifies lookup targets before loading entries. It does not provision lists or change columns.

1. Populate Ticket Categories and set **Active = Yes** for selectable entries.
2. Populate Ticket Subcategories, choosing the correct Category lookup for each entry.
3. Populate Ticket Issue Types as a shared set of request types, independent of category or subcategory.
4. Set Active to Yes for the subcategories and issue types you want offered. Set SortOrder to control their order; equal values sort by name.
5. Open New ticket. Selecting a category filters subcategories; changing category clears the subcategory. Issue Types shows all active issue types and does not change when category or subcategory changes. Subcategories of inactive categories are excluded.

The Tickets list still needs writable Issue Category, Issue Subcategory, and Issue Type (or Issue / Request) columns. Text, single-choice, and single-lookup columns are supported:

- **Lookup columns:** each must target its corresponding configuration list and allow one value. DeskPilot saves source item IDs.
- **Text columns:** DeskPilot saves selected names.
- **Choice columns:** selected names must also exist in the ticket column's configured choices. Keep those choices synchronized or migrate to lookup columns after reviewing existing data.

The configuration lists replace the app's hardcoded hierarchy for creation and editing. Existing unmatched or inactive classifications remain visible on ticket records and are left unchanged when editing other fields. Changing a classification requires an active selection and valid parent relationships.

No new environment variables are required for these exact list names. They use `VITE_SHAREPOINT_SITE_URL` and the existing selected-site grant; the signed-in user needs read access to all three configuration lists. Ticket writes still require the existing write grant and list edit permissions. No additional organization-wide permission is needed for this feature.

If a list or required column is missing, or a parent lookup points to the wrong list, the form shows a configuration error instead of silently using the previous hardcoded choices. Validate live by creating a ticket with all three classifications, refreshing, and editing it again. Also test changing a parent and deactivating a test configuration entry. Automated checks validate mapping and relationships, but do not confirm the live tenant schema.

## FAQ list setup

FAQs now use a table. Users with FAQ list management permissions see **Add**, row selection, and bulk **Make active**, **Make inactive**, and **Delete** actions directly on the FAQs page as well as Administration. Active/inactive maps to the **Active** Yes/No column. Older IsPublished or Published columns are also supported. Deletion confirms the selected count, and partial failures identify affected IDs.

Use **Sort** to reorder all entries (including inactive entries) by dragging rows, or use the up/down controls for keyboard access. **Apply order** saves the new SortOrder values; Cancel discards the unsaved order. Search/category/status filters are disabled during sorting, which always shows the full management list. Refresh uses the refresh icon.

When posting a ticket comment, check **Save to FAQ** to create an inactive FAQ draft with the ticket Title as Question and the comment as Answer. Matching category/subcategory lookup IDs are copied when available. This requires FAQ management permission. The comment and FAQ are separate saves; if the comment succeeds but FAQ creation fails, **Retry Save to FAQ** retries the FAQ without reposting the comment. Review the draft and make it active from FAQs to publish it.

DeskPilot's **FAQs** tab displays published answers with keyword search, category filters, and expandable questions. **Administration** currently opens FAQ management, where permitted staff can create, edit, publish/unpublish, and delete entries. Deletion asks for confirmation. Answers use the rich-text editor.

Create a separate list on the **same site configured in `VITE_SHAREPOINT_SITE_URL`**:

1. Open the site's **Settings > Site contents > New > List > Blank list**.
2. Name it **FAQs**.
3. Keep the built-in **Title** column; optionally rename its display name to **Question**. It stores the question.
4. Add the following columns. Use these exact names when creating them; the app reads the actual internal names from the list schema.

| Column | Type | Settings |
|---|---|---|
| Question (or renamed Title) | Single line of text | Required; maximum 255 characters; a separate Question column takes precedence over built-in Title |
| Answer | Multiple lines of text | Enhanced rich text; required; disable Append changes |
| Category | Lookup to Ticket Categories | Single selection; Text or Choice is also supported for older setups |
| Subcategory | Lookup to Ticket Subcategories | Single selection; its source list needs a Category lookup to the same category source list |
| Keywords | Single line of text | Optional |
| Active | Yes/No | Default No; takes precedence over older IsPublished or Published columns |
| SortOrder | Number | Default 0; minimum 0; lower values appear first |

The app also uses SharePoint's Modified timestamp. It does not create or alter list columns automatically.

If the list has another name, add `VITE_FAQS_LIST_NAME=Your list name` to `.env.local`. Optionally set `VITE_FAQS_LIST_ID` to its GUID; an ID takes precedence over the name. Restart the development server after configuration changes, and rebuild deployed bundles. Existing ticket settings stay unchanged.

**Permissions:** Keep Microsoft Graph delegated Sites.Selected with the existing **Write** grant for this site. Readers need permission to read the FAQs list. FAQ managers need add, edit, and delete list-item permissions. The management screen checks these through SharePoint REST using the existing delegated SharePoint **AllSites.Write** consent described in section 9; this does not grant the signed-in user additional rights. Restrict list editing to the support team in SharePoint list permissions. Do not rely on hiding buttons to protect data.

**Draft visibility:** Published controls what DeskPilot displays; it is not a security boundary. Users who can read the whole list may also read drafts directly through SharePoint or Graph. For confidential drafts, configure appropriate item-level permissions or use a separate restricted authoring list and publishing workflow.

To verify:

1. Open **Administration** as a user allowed to manage the FAQs list.
2. Create a draft with a question, answer, category, keywords, and sort order.
3. Confirm it appears in management but not in the **FAQs** tab.
4. Edit it, enable **Published**, and save. Confirm the answer appears on the FAQs page with its formatting.
5. Test searching by question, answer, and keyword; test category filtering.
6. Unpublish it and confirm it disappears from the reader page. Delete a test entry and confirm the deletion dialog and refreshed list.
7. Sign in as a read-only user: published FAQs should load, management should deny access, and direct writes must be denied by SharePoint.

If the list is missing or its columns have the wrong types, DeskPilot shows a setup error rather than sample content. A successful local build does not verify live list access; complete these checks in your tenant. This implementation connects FAQ persistence in the Azure app; the original SPFx data source will report that FAQs are unavailable until it receives its own adapter.

These instructions cover Microsoft Entra registration, local sign-in, organization user search, and ticket write permissions. Initial local sign-in was confirmed; later permission changes must be verified in your tenant. Microsoft Lists remain the data store. Azure hosting deployment is the next stage and is not covered by this record.

## 1. Register DeskPilot in Microsoft Entra ID

1. Open [Microsoft Entra admin center](https://entra.microsoft.com/) using your organization account.
2. Go to **Entra ID → App registrations → New registration**.
3. Enter **DeskPilot** as the name.
4. Under supported account types, select **Accounts in this organizational directory only**.
5. Under **Redirect URI**, select **Single-page application (SPA)** and enter:

   ```text
   http://localhost:5173/
   ```

6. Click **Register**.
7. On the registration's **Overview** page, copy these two values locally:
   - **Application (client) ID**
   - **Directory (tenant) ID**

Use the SPA platform. A client secret is not needed for this browser app; do not create or put one in its configuration.

[Microsoft SPA registration guidance](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-single-page-app-sign-in)

## 2. Create the local configuration file

The `.env.example` file is the configuration template. Create `.env.local` in the same `azure-app` folder.

In VS Code:

1. Right-click `.env.example` → **Copy**.
2. Right-click the `azure-app` folder → **Paste**.
3. Rename the copy to `.env.local`.
4. Open `.env.local`.

Alternatively, run in PowerShell:

```powershell
Set-Location D:\Dev\CustomApps\spfx-helpdesk\azure-app
Copy-Item .env.example .env.local
notepad .env.local
```

If `.env.local` already exists, open it without copying over it.

Enter your copied Entra IDs:

```dotenv
VITE_ENTRA_TENANT_ID=your-directory-tenant-id
VITE_ENTRA_CLIENT_ID=your-application-client-id
```

Keep these settings:

```dotenv
VITE_SHAREPOINT_SITE_URL=https://archwaysdigitalgh.sharepoint.com/sites/ithelpdesk
VITE_TICKETS_LIST_NAME=Tickets
VITE_GRAPH_SITE_SCOPE=Sites.Selected
```

Leave optional list IDs empty unless needed. Save the file and keep `.env.example` as the reusable template. The tenant and client IDs are public identifiers, not client secrets. `.env.local` is ignored by Git.

## 3. Add Microsoft Graph delegated permissions

1. Open [Microsoft Entra admin center](https://entra.microsoft.com/).
2. Go to **Entra ID → App registrations → DeskPilot → API permissions**.
3. Click **Add a permission → Microsoft Graph → Delegated permissions**.
4. Search for **Sites.Selected**, select it, and click **Add permissions**.
5. Confirm **User.Read** is also listed. It is usually added automatically.
6. Click **Grant admin consent for your organization**. If you cannot grant consent, your tenant administrator must complete this step.
7. Confirm both permissions show **Granted**.

| Permission | Type |
|---|---|
| User.Read | Delegated |
| Sites.Selected | Delegated |

Keep `VITE_GRAPH_SITE_SCOPE=Sites.Selected` in `.env.local`.

`Sites.Selected` alone provides no site access. An explicit site grant is also required, and the signed-in user must have access to the site and list.

[Microsoft selected-permissions guidance](https://learn.microsoft.com/en-us/graph/permissions-selected-overview)

## 4. Grant DeskPilot write access to the IT Helpdesk site

Use [Microsoft Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer).

This step requires a **SharePoint Administrator or higher who is also a member of the target site**. Graph Explorer needs delegated `Sites.FullControl.All` to create the grant. That administrative permission belongs to Graph Explorer, not the DeskPilot app registration.

1. Open Graph Explorer and sign in with your organization's administrator account.
2. Select **GET**, keep **v1.0**, and enter:

   ```text
   https://graph.microsoft.com/v1.0/sites/archwaysdigitalgh.sharepoint.com:/sites/ithelpdesk
   ```

3. Under **Modify permissions**, consent to `Sites.FullControl.All` for Graph Explorer, then click **Run query**.
4. In the response, copy the complete **id** value. It usually contains the hostname and two GUIDs separated by commas.
5. Change the method to **POST** and enter this URL, replacing `SITE_ID` with that complete value:

   ```text
   https://graph.microsoft.com/v1.0/sites/SITE_ID/permissions
   ```

6. In **Request body**, paste:

   ```json
   {
     "roles": ["write"],
     "grantedToIdentities": [
       {
         "application": {
           "id": "YOUR_DESKPILOT_CLIENT_ID",
           "displayName": "DeskPilot"
         }
       }
     ]
   }
   ```

7. Replace `YOUR_DESKPILOT_CLIENT_ID` with the value of `VITE_ENTRA_CLIENT_ID` from `.env.local`.
8. Click **Run query**.
9. Confirm the response is **201 Created** and the returned roles include **write**. The original setup used a read grant; existing installations should follow section 10 to upgrade that grant instead of creating a duplicate.

[Microsoft site-permission API requirements](https://learn.microsoft.com/en-us/graph/api/site-post-permissions?view=graph-rest-1.0)

## 5. Check or create the Tickets list

1. Open the [IT Helpdesk site](https://archwaysdigitalgh.sharepoint.com/sites/ithelpdesk).
2. Go to **Settings → Site contents**.
3. Confirm there is a list named **Tickets**.
4. If it is missing, select **New → List → Blank list**, name it **Tickets**, and add these columns:

   | Column | Type | Settings |
   |---|---|---|
   | Title | Single line of text | Already exists |
   | Status | Choice | New, In Progress, Resolved, Closed, Pending, Escalated |
   | Priority | Choice | Low, Medium, High, Critical |
   | AssignedTo | Person or Group | Allow one person |

5. Add one sample ticket with a title, status, priority, and yourself as the assignee.

The fuller list schema, including optional dashboard columns, is documented in [README.md](README.md#3-prepare-microsoft-lists).

## 6. Run DeskPilot locally

In the VS Code PowerShell terminal, run:

```powershell
Set-Location D:\Dev\CustomApps\spfx-helpdesk\azure-app
npm ci
npm run dev
```

Keep the terminal running. Open:

```text
http://localhost:5173/
```

Sign in with your organization account. DeskPilot opens directly in the browser without SharePoint navigation. No SPFx debug-manifest URL is required.

If you change `.env.local` while the development server is running, restart `npm run dev` so the new configuration is loaded.

## 7. Resolve the fetch error encountered during sign-in

During the initial attempt, DeskPilot displayed:

```text
Failed to execute 'fetch' on 'Window': Illegal invocation
```

The Graph client had stored the browser's `fetch` function and called it as a class method, giving it the wrong browser context. The default transport in `src/services/GraphClient.ts` was corrected to:

```typescript
private readonly request: typeof fetch = (...args) => globalThis.fetch(...args)
```

This fix is already included in the project; no manual code change is needed.

Validation after the fix:

- All **9 tests passed**, including a regression test checking the fetch receiver.
- The production build succeeded.

With `npm run dev` still running, press **Ctrl + Shift + R** at `http://localhost:5173/`, then try signing in again.

**Confirmed outcome:** local sign-in succeeded. Azure deployment and live ticket-data verification remain separate next steps.

## 8. Enable organization user search

The assignment picker searches Microsoft Entra users directly, including people who have never been assigned a ticket. It searches by the beginning of a name or email address. The optional department filter uses the exact department name stored in the user's Entra profile; it is separate from a ticket's Department column.

1. Open [Microsoft Entra admin center](https://entra.microsoft.com/).
2. Go to **Entra ID > App registrations > DeskPilot > API permissions**.
3. Click **Add a permission > Microsoft Graph > Delegated permissions**.
4. Search for the complete name **User.Read.All**.
5. Expand the **User** category and check **User.Read.All**. Do not select a permission under IdentityRiskyUser.
6. Click **Add permissions**.
7. Back on API permissions, click **Grant admin consent for your organization** and confirm. If unavailable, ask your tenant administrator to do this.
8. Confirm **Microsoft Graph / User.Read.All / Delegated** shows **Granted**.

Keep the existing **User.Read** and **Sites.Selected** permissions. No change to `VITE_GRAPH_SITE_SCOPE=Sites.Selected` is required.

`User.Read.All` permits directory profile reading, including department data; it does not grant ticket write access. DeskPilot requests this permission separately when organization search is used.

[Microsoft Graph user-list API](https://learn.microsoft.com/en-us/graph/api/user-list?view=graph-rest-1.0)

## 9. Enable SharePoint person resolution for assignments

Finding a person in Entra and saving that person in a SharePoint Person column are separate operations. SharePoint requires its own numeric user lookup ID, not the user's Entra GUID. DeskPilot resolves the selected person through the configured site's `/_api/web/ensureuser` endpoint before saving an assignment.

1. In **DeskPilot > API permissions**, click **Add a permission**.
2. Select **APIs my organization uses**.
3. Search for **Office 365 SharePoint Online** and select it. If the picker offers a direct **SharePoint** tile, that is also the SharePoint API.
4. Select **Delegated permissions**.
5. Search for **AllSites.Write**, expand **AllSites** if necessary, and check **AllSites.Write**.
6. Click **Add permissions**.
7. Click **Grant admin consent for your organization** and confirm.
8. Confirm the permission appears under **SharePoint**, has type **Delegated**, and shows **Granted**.

This is broader delegated SharePoint access across sites the signed-in user can access, subject to that user's permissions. In this implementation, it is used for person resolution on the configured ticket site. It does not add the selected person to a site membership group. Review this scope with your administrator; a backend alternative is needed if this broader delegated permission is not acceptable.

Do not select Application permissions. **SharePoint AllSites.Write** is different from **Microsoft Graph Sites.Selected**. Adding it does not replace the Graph site write grant in section 10. DeskPilot acquires a separate SharePoint token; Graph tokens cannot authorize SharePoint REST calls.

[Microsoft SharePoint ensureUser reference](https://learn.microsoft.com/en-us/previous-versions/office/sharepoint-visio/jj245233%28v%3Doffice.15%29)

## 10. Fix ticket creation or editing denied with 403

If DeskPilot can read tickets but creation fails with `403 / accessDenied`, check both the application's site grant and your account's list permissions. The original setup used **read**, which is insufficient for ticket creation and editing.

### 10.1 Check your account's list permissions

1. Open the configured ticket list directly in Microsoft Lists or SharePoint.
2. Try creating a test ticket and editing it.
3. If either operation fails there too, ask the site owner to grant your account permission to add and edit list items. Fixing the application's grant alone will not fix your account's access.

### 10.2 Inspect the existing application grant

Use the administrator's Graph Explorer connection described in section 4, with delegated **Sites.FullControl.All** consent for **Graph Explorer**. This administrative permission does not belong on the DeskPilot app.

1. Obtain the configured site's complete `SITE_ID` as described in section 4. Use the actual site URL from `.env.local` if it differs from the example.
2. In Graph Explorer, select **GET**, **v1.0**, and run:

   ```text
   https://graph.microsoft.com/v1.0/sites/SITE_ID/permissions
   ```

3. Find the entry whose application ID matches **VITE_ENTRA_CLIENT_ID** in `azure-app/.env.local`. Check `grantedToIdentitiesV2` or `grantedToIdentities` in the response. Do not choose an entry by display name alone.
4. Copy that entry's top-level **id** as `PERMISSION_ID` and inspect **roles**.
5. If it already contains **write**, leave it unchanged and check the signed-in user's list access, tenant, and configured site/list instead.

### 10.3 Upgrade an existing read grant

1. Select **PATCH** and enter:

   ```text
   https://graph.microsoft.com/v1.0/sites/SITE_ID/permissions/PERMISSION_ID
   ```

2. Replace both placeholders with the values obtained above.
3. Set **Request body** to:

   ```json
   {
     "roles": ["write"]
   }
   ```

4. Click **Run query**.
5. Confirm **200 OK** and that the returned roles contain **write**.
6. Run the GET permissions query again to verify the grant for the correct DeskPilot client ID.

If no grant exists for this client ID on the configured site, use section 4 to create a new **write** grant. Do not create another grant merely because an existing one says read.

[Microsoft update-site-permission API](https://learn.microsoft.com/en-us/graph/api/site-update-permission?view=graph-rest-1.0) · [Selected permissions and delegated access](https://learn.microsoft.com/en-us/graph/permissions-selected-overview)

## 11. Verify the completed setup in DeskPilot

The API permissions page should contain:

| API | Permission | Type | Purpose |
|---|---|---|---|
| Microsoft Graph | User.Read | Delegated | Signed-in user's profile |
| Microsoft Graph | Sites.Selected | Delegated | Ticket access on the explicitly granted site |
| Microsoft Graph | User.Read.All | Delegated | Organization user search and department data |
| SharePoint | AllSites.Write | Delegated | Resolve the selected person to a SharePoint lookup ID |

In addition, the correct DeskPilot client ID must have a **write** grant on the configured ticket site, and the signed-in user must be allowed to add/edit items in the ticket list.

1. Sign out of DeskPilot, then sign back in at `http://localhost:5173/` with your organization account.
2. On **Tickets**, double-click an **Assigned to** field. A single click deliberately does not open assignment.
3. Search with at least two characters from the beginning of a user's name or email.
4. Optionally enter the exact Entra department name. You can also search a department without entering a name. Leave it blank for organization-wide search.
5. Select a person. If Microsoft redirects you for additional consent, complete it, then reopen the assignment picker and repeat the selection.
6. Confirm the assignment is saved, refresh, and confirm it remains. In the ticket edit form, selecting a person updates the draft; click **Save** to persist it.
7. Test creating and editing a ticket separately to verify the Graph write grant.

Search shows up to 50 matches. Refine the name or department if needed. Empty or inaccurate Entra department values will affect department filtering.

| Symptom | Check |
|---|---|
| Organization search returns 403 | Microsoft Graph delegated User.Read.All consent for the correct DeskPilot app and tenant |
| No users match | Name/email prefix, exact department spelling, and department values in Entra profiles |
| Person resolution fails with 401/403 | SharePoint delegated AllSites.Write consent and the signed-in user's site access |
| Ticket creation or update returns 403 | Correct Graph site write grant and the account's list add/edit permissions; follow section 10 |
| Consent appears again or redirects back to the app | Complete consent, then reopen the picker; directory and SharePoint permissions use separate token requests |

These instructions document the required setup, not a confirmation that all live tenant permissions have been changed or verified. The local build and automated tests cannot prove live directory search or SharePoint write access.
