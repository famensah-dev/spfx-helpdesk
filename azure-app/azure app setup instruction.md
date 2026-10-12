# DeskPilot Azure App Setup Instructions

These steps record the setup completed from Microsoft Entra app registration through successful local sign-in. Microsoft Lists remain the data store. Azure hosting deployment is the next stage and is not covered by this record.

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

## 4. Grant DeskPilot read access to the IT Helpdesk site

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
     "roles": ["read"],
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
9. Confirm the response is **201 Created**. This was the successful result during setup.

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
