# Support units and assignment

## Enable and configure

1. Deploy the updated package. A Super Admin runs **Initialize workspace**, reviews the additions and reloads DeskPilot. New installations need only **Support Units** and **Unit Members** for this feature. Tickets retain the **Assigned Unit** lookup.
2. A Helpdesk Admin or Super Admin opens **Administration > Support Units**.
3. Select **Create units** and enter one unit name per line to create several units at once. Existing names are skipped. Then open a unit card and add its members. A person can belong to several units. Mark availability and set rotation order.
4. Select the unit's ticket categories and assignment method, then **Save settings**. Each category can belong to one active unit. Subcategories are not used.
5. Choose **Round robin** to take turns among available members, or **Specific member** to select one available person from that unit. Member edits preserve unsaved unit settings; save those settings separately.

The overview lists unit cards with a setup status. Open a card to configure it; **Back to units** returns to the overview. Each unit groups its details, categories, assignment and members in one workspace. Unit membership does not grant app roles, site membership or SharePoint permissions. Choose existing DeskPilot agents/admins. Delegated SharePoint read/write permissions still apply. Agents retain their existing individually-assigned ticket view; membership does not expand access.

## What runs now

**Auto assign tickets** is a workspace switch, off by default. Enable it under **Settings > General** or the **Administration > Support Units** overview. Both controls change the same setting. Helpdesk Admins can use the overview control. Turning it off stops category routing for new app-created tickets; explicit manual assignments still work. Existing assigned tickets remain untouched.

DeskPilot routes newly created tickets that have no explicitly selected assignee. It finds the active unit that contains the category ID. Round robin advances `Support Units.LastMemberId` through available Unit Members, ordered by RotationOrder then membership item ID. Specific member uses `DefaultMemberId`, which is a **Unit Members item ID**, and assigns that member's Person lookup ID to the ticket. Specific assignment does not advance the round-robin cursor.

If all members are unavailable, or the designated member becomes unavailable or is removed, the ticket is tagged with the unit and remains unassigned for administrator review. The app does not silently assign unavailable people or substitute an unrelated person. No matching unit leaves the ticket unassigned. Existing assignees are preserved.

There is no ticket-ID routing tool in this interface. Administrators create units, configure them, and enable Auto assign tickets. Changing settings does not retrospectively move assigned work or automatically drain waiting tickets.

Cursor reservation and ticket writes use exact item ETags. Cursor conflicts re-read and retry up to five times. Ticket conflicts stop rather than overwrite another assignment. SharePoint has no transaction across these items, so a successful reservation followed by a failed ticket write may skip a turn. Routing failures after ticket creation report the created ticket ID to avoid duplicate submissions. Ticket attachments upload before routing.

## Storage and upgrades

**Support Units** stores Title, Active, AssignmentMethod, LastMemberId, CategoryIds and DefaultMemberId. RecordType distinguishes Unit records from one workspace Settings record, which stores AutoAssignEnabled. That settings record is excluded from unit cards and membership choices. No third list is required. Missing settings or duplicate Settings records leave automatic assignment disabled. CategoryIds is plain multiline text containing a JSON array of category lookup IDs, for example `[1,4,7]`. The interface manages it; users select category names through checkboxes.

**Unit Members** stores the Unit lookup, Member Person field, display name in Title, Available and RotationOrder. Per-unit availability and rotation order are why members have a separate list.

New initialization does not create Routing Rules. An existing Routing Rules list is retained without deletion. Units with blank/missing CategoryIds read active legacy category rules until their settings are saved; saving stores the categories directly on the unit. Explicit `[]` means no categories and never restores old rules. Once every existing unit has been saved, the legacy list is no longer consulted. Legacy Unit queue settings appear as Specific member; select a designated member and save to enable that assignment method. Initialization appends supported choices and preserves old data.

## Power Automate routing for Forms/email

No background assignment or email flow is deployed by the local app build. Forms/email tickets require a separately configured tenant flow. Use one routing flow for external intake, with trigger concurrency **1** and a connection that can edit Tickets, Support Units and Unit Members. Keep ETag checks because DeskPilot can route concurrently.

1. Trigger after the intake flow finishes setting the ticket category. A create-only trigger can run too early if classification is updated later. For created-or-modified triggers, terminate early when a ticket is already assigned.
2. Re-read the ticket and retain its exact ETag. Continue only when Status is New and Assigned To is empty.
3. Read the single Support Units record with RecordType Settings. Stop unless AutoAssignEnabled is true; duplicates are an error. Then read active Unit records. Parse each CategoryIds field with `json(...)` and match the ticket's category lookup ID. No match leaves the ticket for administrator review. Multiple matches are a configuration error. Preserve a different existing Assigned Unit. For upgrades, save all unit settings in DeskPilot first so categories are embedded.
4. Read the selected unit's Unit Members. For Specific member, select the member whose item ID equals DefaultMemberId. Verify it belongs to that unit and Available is true. Assign its Member Person lookup ID. Do not advance LastMemberId.
5. For Round robin, sort members by RotationOrder ascending and item ID ascending. Start after LastMemberId, wrap around, and skip unavailable members. A removed cursor member restarts from the beginning. If nobody is available, write Assigned Unit only and alert an administrator.
6. Re-read the unit with its ETag. Verify it is still active with unchanged assignment settings. For round robin, reserve the chosen member by conditionally updating LastMemberId to the **membership item ID**. On HTTP 412, re-read the cursor and select again, up to five attempts.
7. Conditionally update the ticket with the ETag from step 2: Assigned Unit = unit item ID, Assigned To = selected member's SharePoint Person lookup ID, Status = Assigned. On HTTP 412, re-read and stop if another process assigned or changed the ticket. Never use `IF-MATCH: *`.
8. Log failures and notify administrators through your own flow. Retry the same ticket ID rather than creating a new ticket.

Use **Send an HTTP request to SharePoint** for ETag-aware writes. Example round-robin reservation (replace placeholders with flow values):

```http
POST _api/web/lists(guid'<SUPPORT_UNITS_LIST_ID>')/items(<UNIT_ITEM_ID>)
Accept: application/json;odata=nometadata
Content-Type: application/json;odata=nometadata
IF-MATCH: <EXACT_UNIT_ETAG>
X-HTTP-Method: MERGE

{"LastMemberId": <SELECTED_UNIT_MEMBER_ITEM_ID>}
```

For ticket assignment, use the ticket ETag and actual internal column names. Standard initialized REST fields use `AssignedUnitId` and `AssignedToId` (Graph uses `...LookupId`):

```json
{"AssignedUnitId": 1, "AssignedToId": 11, "Status": "Assigned"}
```

Use the list IDs saved by initialization. Existing Category text columns are supported by the app through exact title matching; prefer category lookup IDs in new flows. External flows have not been installed or live-tested by the local build.

Bulk unit creation checks the required schema before writing. Missing columns produce an Initialize workspace instruction rather than attempting a failing save. Names are validated before creation, processed sequentially, and existing names skipped. If a save response is lost, the app stops and retains failed/unattempted names; retrying reads existing units first to avoid duplicating confirmed server records.
