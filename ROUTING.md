# DeskPilot links

DeskPilot uses React Router's HashRouter. Routes follow the existing SharePoint
page URL and query parameters:

`https://tenant.sharepoint.com/sites/support/SitePages/DeskPilot.aspx?env=WebView#/tickets/123`

Navigation changes only the fragment, so `env=WebView` and other SharePoint query
parameters remain intact. No SharePoint server rewrite rules are required.

| Page | Fragment |
| --- | --- |
| Dashboard | `#/dashboard` |
| Personal dashboard | `#/my-dashboard` |
| Tickets | `#/tickets` |
| Ticket details | `#/tickets/123` |
| New ticket | `#/tickets/new` |
| Assigned tickets | `#/my-tickets` |
| Knowledge Base | `#/knowledge-base` |
| Helpdesk settings | `#/settings` |
| Support teams | `#/settings/teams` |
| Automatic assignment | `#/settings/auto-assignment` |
| Users and roles | `#/users-and-roles` |
| Workspace settings (Super Admin) | `#/workspace-settings/general` |

Settings sections and ticket-list views also update the fragment. For example,
`#/tickets?view=Archive` retains the archive view on refresh. Workspace settings
are separate from Helpdesk settings and retain the existing Super Admin check.

Use the link icon next to a ticket ID to copy its URL, or copy the browser address.
Opening a link still requires SharePoint access and the user's DeskPilot role.
Missing or inaccessible tickets show a message; links never grant access.

The empty route selects the user's permitted starting page. Browser Back and
Forward work between routes. Unsaved form drafts and edit dialogs are not stored
in URLs and do not survive refreshing the page.

Run `node tests/appRouting.cjs` to verify navigation, refresh/remount, permissions,
missing and loading tickets, settings sections, and preservation of `env=WebView`.
