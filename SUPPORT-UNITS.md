# Support units and assignment

## Enable and configure

1. Deploy the updated package. A Super Admin runs **Initialize workspace**, reviews the additions and reloads DeskPilot. This adds Support Units, Unit Members, Routing Rules and the Tickets **Assigned Unit** lookup. Existing records and assignees are preserved.
2. A Helpdesk Admin or Super Admin opens **Administration → Support Units**.
3. Create units, choosing **Round robin** or **Unit queue**. Add existing DeskPilot agents/admins as members. A person may belong to several units. Set their availability and numeric rotation order (lower numbers first; membership item ID breaks ties).
4. Add active category rules. Each category can have only one active routing rule. Inactive units/rules are ignored.

Unit membership does not grant app roles, site membership or SharePoint permissions. Use existing Users & Roles for app access. Delegated SharePoint permissions still apply to all configuration and assignment operations. Admins require read/write access to these lists. Agents retain their existing individually-assigned ticket view; unit membership does not expand it. Unit queues are monitored by administrators.

## What runs now

DeskPilot routes newly created tickets that have no explicitly selected assignee. Round robin advances `Support Units.LastMemberId` through available Unit Members. A unit queue, or a round-robin unit with no available members, sets Assigned Unit and leaves Assigned To empty and Status New. No matching rule leaves the ticket unassigned for administrator review.

**Route ticket** in Support Units applies the same rules to a supplied existing ticket ID. It only processes New, unassigned tickets. It preserves an existing assignee or a different existing unit. This also lets an administrator retry tickets that stayed in a round-robin queue when all members were unavailable. Changing rules or availability does not retrospectively move assigned tickets or automatically drain queues.

Both cursor reservation and ticket writes use exact item ETags. Cursor conflicts re-read and retry up to five times; ticket conflicts stop rather than overwrite another assignment. SharePoint has no transaction across these two items: if reservation succeeds but the ticket write fails, the rotation may skip a turn. A retry cannot replace an assignee that is already present. If routing fails after creation, the app reports the created ticket ID so the user does not submit a duplicate.

No email notification flow is installed by this feature. No background assignment flow is deployed automatically. The app must be open to route its own ticket creations; directly created Forms/email items need the flow below.

## Power Automate routing contract for Forms/email

Use one assignment flow for all external intake sources, with a dedicated connection that can edit Tickets and the three configuration lists. Configure trigger concurrency to **1** to serialize that flow's runs; keep ETag checks too, because DeskPilot can assign concurrently.

1. Trigger on a created Tickets item, or call assignment after your intake flow has finished setting the category. If classification happens after initial creation, a create-only trigger can fire too early. A created-or-modified trigger must terminate early for already assigned tickets to avoid loops.
2. Re-read the ticket and retain its exact item ETag. Continue only if Status is New and Assigned To is empty.
3. Read Routing Rules and Support Units. Match Category by lookup ID. Require Active on both the rule and unit. If multiple active rules match the category, stop and report the configuration error. Do not guess a unit. Preserve a different existing Assigned Unit.
4. For Unit queue, write Assigned Unit only. Leave Assigned To empty and Status New.
5. For Round robin, read Unit Members for the selected unit. Sort by RotationOrder ascending, then membership item ID ascending. Start after the member whose item ID equals LastMemberId, wrap around, and choose the next Available member. If the cursor refers to a removed member, start at the beginning. If nobody is available, write Assigned Unit only.
6. Re-read the unit with its ETag. Reserve the chosen member by conditionally updating LastMemberId to the **Unit Members item ID**, not the person's ID. On HTTP 412, re-read the cursor and select again. Retry up to five times. If the unit is now inactive or its method changed, stop and retry from fresh configuration.
7. Conditionally update the ticket using the ETag from step 2: Assigned Unit = unit item ID; Assigned To = the member's SharePoint Person lookup ID; Status = Assigned. On HTTP 412, re-read the ticket and stop if somebody already assigned or changed it. Never overwrite using `IF-MATCH: *`.
8. Record failures and notify the administrator using your own flows. Use the same ticket item ID for retries; do not create another ticket.

Use **Send an HTTP request to SharePoint** for ETag-aware updates; normal Update item actions do not express this reservation contract. Example request for reserving a unit cursor (replace IDs and the exact ETag with flow values):

```http
POST _api/web/lists(guid'<SUPPORT_UNITS_LIST_ID>')/items(<UNIT_ITEM_ID>)
Accept: application/json;odata=nometadata
Content-Type: application/json;odata=nometadata
IF-MATCH: <EXACT_UNIT_ETAG>
X-HTTP-Method: MERGE

{"LastMemberId": <SELECTED_UNIT_MEMBER_ITEM_ID>}
```

For the ticket update, use the ticket's ETag and actual internal column names. Standard initialized columns use this REST body (Graph uses `...LookupId` instead of REST's `...Id`):

```json
{
  "AssignedUnitId": 1,
  "AssignedToId": 11,
  "Status": "Assigned"
}
```

List names are defaults; use the IDs saved by workspace initialization and check internal column names in your tenant. Existing Category text columns are supported by the app through exact title matching; prefer lookup IDs in new flows. The flow is a separate tenant setup step and has not been installed or live-tested by the local build.
