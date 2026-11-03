# Connecting DeskPilot in Teams

The Teams host URL is not the workspace. A personal app may run at the tenant root, and a channel app may run in a different team's site. DeskPilot must connect explicitly to the existing workspace; it never initializes a workspace at the Teams host as a fallback.

## First connection

Open DeskPilot in Teams. Enter the site containing the existing DeskPilot lists and the SharePoint page containing the web part. Select **Connect**. The app checks the site's identity, your actual permissions and the workspace configuration before allowing setup or normal use. No lists are created by Connect.

The connection is remembered per tenant and signed-in account in this browser. Embedded clients that block local storage retain it for the current session only. Super Admins can change it under Settings > General > Change workspace connection. Both URLs must be HTTPS and in the same tenant; the page must be inside the workspace site. SharePoint permission checks still apply to every user.

## Optional organization-wide default

A tenant-root site owner can create the folder `DeskPilot` in the root site's **Site Assets** library and upload `teams-connection.json`:

```json
{
  "siteUrl": "https://YOURTENANT.sharepoint.com/sites/YOURWORKSPACE",
  "pageUrl": "https://YOURTENANT.sharepoint.com/sites/YOURWORKSPACE/SitePages/DeskPilot.aspx?env=WebView"
}
```

The file's address is `https://YOURTENANT.sharepoint.com/SiteAssets/DeskPilot/teams-connection.json`. Give intended staff Read access to the file; only trusted workspace administrators should be able to edit it. It contains no credentials. This pointer does not grant access to the target workspace. Existing target-site permissions and DeskPilot role groups determine access.

On opening Teams, this default takes priority over the browser's saved connection. If absent or inaccessible (404/403), the app uses a saved connection or asks the user. An invalid readable default displays an error instead of silently selecting the tenant root. A temporary session change is possible under Settings > General > Change workspace connection; the shared default is reapplied on reopening. To move the workspace, migrate its data and permissions, then update these URLs. No source-code edits or tenant-specific build are required.

## Channel tabs / SharePoint web parts

The web part property pane also provides **Workspace SharePoint site URL** and **Workspace DeskPilot page URL**. If configured, these take priority over both the shared default and browser storage. Configure both together. Ordinary SharePoint pages without overrides continue using their current site.

## Scope

Tickets, role groups, access configuration, knowledge base, notifications, setup, default-view changes, maintenance and Settings site browsing use the selected workspace. Default email links and Copy Ticket Link use the configured DeskPilot page. Existing deliberate email-page overrides are retained; saved Teams hosting links are corrected when email settings are loaded with a real SharePoint page connection.

This change requires deployment of the updated SPFx package. It does not require extra Microsoft Graph permissions or deployment of a backend. Test with a site owner and an ordinary requester in your Teams tenant; automated tests cannot validate your live tenant permissions or client storage policy.
