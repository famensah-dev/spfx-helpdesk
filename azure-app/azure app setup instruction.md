# DeskPilot Azure App Setup Instructions

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
