# Helpdesk Admin Settings Access

Helpdesk Admins can use the regular Settings sections, including Users & Roles.
Ticket List Schema and the top-bar workspace settings, initialization and maintenance remain Super Admin only.

## Existing Sites: Publish Access Once

After deploying the updated package, a SharePoint site owner must open DeskPilot.
The owner publishes the existing role configuration and grants the **DeskPilot Helpdesk Administrator** group Full Control on the private **DeskPilot Access** list and its protected entries. This is list-scoped, not site-wide Full Control. Agents and requesters retain their individual read-only projections.

Helpdesk Admins need to read the complete role configuration and manage these entries to maintain users and roles. Consequently, members of this group are trusted access administrators; SharePoint API access to that list is broader than the controls displayed in DeskPilot. Top-bar restrictions are application restrictions, not field-level SharePoint security on the configuration JSON.

## Delegate Role-Group Membership Management

In the workspace SharePoint site (as a site owner):

1. Open **Site Settings → People and Groups**.
2. Open each DeskPilot group: **DeskPilot Agents**, **DeskPilot Helpdesk Administrator**, and **DeskPilot Requesters**.
3. Open **Settings → Group Settings**.
4. Set the **Group Owner** to **DeskPilot Helpdesk Administrator**. Keep **Who can edit the membership of the group?** set to **Group Owner**.
5. Save each group.

This allows Helpdesk Admins to add/remove members of these three groups without site-wide Manage Permissions. Site owners retain administrative control. DeskPilot does not automatically replace existing SharePoint group ownership.

The existing SharePoint permission levels for those groups remain unchanged. Other settings still require the appropriate list permissions (for example Manage Lists when editing classification metadata). DeskPilot cannot elevate a delegated request beyond the signed-in user's SharePoint permissions.

## Verify With a Separate Admin Account

- Open Settings and save a category, SLA rule, assignment setting and email setting.
- Open Users & Roles; add an agent, change their role, and remove the test user. Confirm SharePoint membership changes.
- Confirm Ticket List Schema and top-bar workspace settings are unavailable.
- Confirm an ordinary agent cannot load the complete role configuration or save role changes.

Existing memberships and permission levels must be reviewed on the live site; local tests cannot verify deployed SharePoint ACLs.
