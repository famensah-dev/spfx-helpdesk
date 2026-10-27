# DeskPilot SharePoint group onboarding

Initialization checks **DeskPilot Agents** and **DeskPilot Helpdesk Administrator** on the current site. Existing groups keep their permission levels, owners, description and membership. Missing groups are created with **Read** permission only. A temporary description marker allows interrupted Read initialization to finish on retry without duplicating groups or replacing permission levels already assigned by the owner.

Review the initialization plan, then run Initialize workspace as a site owner. On new sites, configure the new groups' working permissions before asking agents to edit tickets; Read alone allows viewing but not ticket creation or updates. Existing custom Agent permissions and Admin Contribute permissions are preserved.

Users & Roles maps role ID `agent` to DeskPilot Agents and `admin` to DeskPilot Helpdesk Administrator. Adding, activating, changing, disabling or removing a DeskPilot assignment synchronizes those two group memberships. Obsolete membership is removed before the new group is granted. Other SharePoint groups, direct grants, Microsoft 365 groups and manually added group members without a DeskPilot assignment are left untouched. Role editing stays restricted to site owners.

Existing assignments reconcile when a site owner opens DeskPilot or saves roles. App configuration, group memberships and private access projections are separate SharePoint writes, so failures can be partial. Error messages instruct the owner to reload and retry; initialization and membership checks avoid routine duplicate writes. No standard SharePoint invitation is sent. Share the published DeskPilot page URL directly, including `?env=WebView` when used.

This synchronizes group membership only. Group permission levels, unique page/list/item permissions and other broader grants still determine actual SharePoint access. The app's assigned-ticket view does not enforce assigned-ticket-only permissions outside the app. This feature neither breaks ticket inheritance nor creates per-ticket permissions, and it does not downgrade existing Members/Owners grants. Disabling an app role removes the two managed group memberships but does not revoke unrelated access.

No live site changes are made by local builds or tests. Validate on the deployed site with your approved custom permission levels and a test user. User resolution errors now include SharePoint's actual error message and request ID when supplied, rather than assuming every HTTP 400 is missing API consent.
