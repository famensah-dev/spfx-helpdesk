# Issue tracker migration — verified schema

Status: schema inspected; migration incomplete. No SharePoint columns have been changed.

Evidence: `list-schema.json`, the column definitions supplied from Microsoft Graph on 2026-10-12.
Site: `archwaysdigitalgh.sharepoint.com,5dbf307b-5f8c-4f43-869c-a0255c10f455,fba0bce4-40a0-441f-a481-005e10865c4e`.
List: `63a798c6-c36a-4611-b7f6-4c287982a252` (`Issue tracker`).

## Differences from the previous integration

The previous adapter expects Choice Status/Priority, a single Person assignee, optional Category, and Date/Time DueDate/ResolvedAt. It normalizes In Progress to Assigned and Resolved to Completed. Those assumptions do not match the new schema or requested lifecycle.

| Display name | Actual internal name | Verified type | Migration requirement |
| --- | --- | --- | --- |
| Title | Title | Single-line text | Usable; avoid read-only LinkTitle/LinkTitleNoMenu |
| Description | field_1 | Multiline plain text | Usable |
| Status | field_2 | Single-line text | Adapter must support text; no server-defined choice values exist |
| Priority | field_3 | Single-line text | Adapter must support text; validate supported values in DeskPilot |
| Issue Category | field_4 | Single-line text | Usable for classification names |
| Issue Subcategory | field_5 | Number | Cannot save named subcategories without correcting storage or an explicit numeric code mapping |
| Issue Type | field_6 | Number | Cannot save Issue / Request names without correcting storage or an explicit numeric code mapping |
| Assigned To | field_7 | Single-line text | No Person lookup IDs; decide whether to replace with a Person column or define a text identity convention |
| Expected Resolution Date | field_8 | Number | Date semantics unverified; do not assume Excel serial dates |
| Completed At | field_9 | Number | Date semantics unverified; requested Resolved At alias |
| Closed At | field_10 | Number | Date semantics unverified |
| Resolution Summary | field_11 | Number | Cannot save narrative text |
| Related Issue | field_12 | Number | Could contain item IDs; contents and intended relationship unverified |
| Item Type / Path | field_16 / field_17 | Single-line text | Imported auxiliary fields; no workflow meaning assumed |
| Created / Modified | Created / Modified | Read-only Date/Time | Usable system timestamps |
| Created By / Modified By | Author / Editor | Read-only Person | System authors, not an editable Requested By field |
| Attachments | Attachments | Built-in; no type facet returned | Not a custom upload destination; attachment integration remains separate |

No business column in the supplied response is required. No Requester/Requested By, Department/Unit, Viewed/Started At, Archived, or escalation-specific business columns were returned. Do not infer that they exist. This response does not establish versioning retention or app write permission.

## Configuration completed

`.env.local` now targets the verified list ID and composite site ID. Entra tenant/client and permission settings are preserved. The optional `VITE_SHAREPOINT_SITE_ID` bypasses the site-path lookup that failed during discovery and must match the configured hostname. Restart Vite after changing environment settings.

## Pending decisions and manual SharePoint work

Update: the user chose single-select Choice columns for Issue Category, Issue Subcategory, and Issue Type, and authorized correcting those three columns. Exact options and manual steps are in `sharepoint-choices/`. No remote correction has been executed: an authenticated SharePoint management connection is not available in this workspace. The original schema snapshot remains evidence of the existing types, not the target schema.

Before replacing or recreating incorrectly typed columns, determine whether they contain data to preserve. Do not delete populated columns. Do not assume existing Number values encode text or dates.

Recommended target types: single-line Text or Choice for classification names, single Person for assignment, Date and Time for resolution/closed timestamps, and multiline Text for Resolution Summary. Status/Priority can remain Text with application validation or become Choice after approval. Any replacement column will have a new internal name; retrieve Graph columns again afterward.

No column changes or permission grants are authorized implicitly by this report. The user requested approval before SharePoint schema mutations.

## Remaining implementation and verification

Implement New → Assigned → In Progress → On Hold → Resolved → Closed, preserve legacy values, implement dependent classification dropdowns and reporting, and map the corrected actual fields. Escalation is a separate action, with only verified fields written.

Roles, notifications, attachment operations and department isolation are not implemented by this schema update; do not claim them as preserved working features. The departmental architecture remains deferred.

Live retrieval, creation, assignment, status transitions and classification persistence must all be verified through DeskPilot. Graph Explorer schema success uses a separate application identity and does not prove DeskPilot has write access. Local tests/builds alone do not establish a successful migration.
