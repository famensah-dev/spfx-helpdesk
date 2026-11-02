# Per-user unopened ticket indicators

Deploy the updated SPFx package, open DeskPilot as a SharePoint site owner, review Initialize workspace, and run it once. Initialization adds the hidden DeskPilot Ticket Views list, creates its indexed Title key and LastOpenedAt field, sets ReadSecurity/WriteSecurity to own-created items, disables versioning/attachments, and grants the managed DeskPilot role groups Contribute on this tracking list only. Site owners remain privileged. The final setup callback configures privacy before saving the list binding. Reload DeskPilot after initialization.

Each key is SharePoint-user-ID : ticket-list-GUID : ticket-ID. The actual signed-in account is recorded by SharePoint's Author field; the client does not set Author. All reads additionally check that the returned Author matches the active user, including for privileged users. There is no ticket title, description, requester email, comment or attachment content in a tracking row.

A dot and slightly heavier ticket title mean that the signed-in user has no view record for that ticket. The record is written only after the details component mounts with a loaded, authorized ticket. Notification read/unread status is independent. Opening a ticket does not edit the ticket, alter its Modified date or invoke ticket notification callbacks. An unavailable tracking list leaves the state unknown, hides the dot and shows a non-blocking warning.

Normally there is one row per user-ticket pair, rather than one per visit. A revisit updates the existing LastOpenedAt value, with a one-minute write throttle. Same-session opens share one pending write. Simultaneous first opens on different devices can create duplicate receipts; these are safely treated as opened and subsequent visits reuse a matching receipt. SharePoint does not support unique fields together with own-item read restrictions. Initialization removes the former unique constraint while retaining the index and existing records. Versioning is disabled so repeat updates do not accumulate a visit history.

For example, 10,000 tickets opened by an average of three people produce about 30,000 tracking rows. Larger deployments can still accumulate many rows. SharePoint's 5,000-item view threshold is not the total-list capacity; use indexed queries rather than an unfiltered All Items view. The app checks only the visible page (at most 100 IDs) using point queries against the Title index, with at most 20 subrequests per Graph batch. It does not download the entire tracking list. Session caching reduces repeated reads. Other-device opens become visible on data refresh or window focus after the short negative-cache interval.

Native own-created-item settings avoid creating a separate permission scope for every receipt. They do not hide records from site owners or administrators holding SharePoint permissions that bypass own-item rules. Users can modify their own tracking data, so this is a convenience feature, not an audit or compliance record.

The normal Clear list items operation excludes this list, as clearing it would make existing tickets look unopened. There is no automatic age expiry or hard row cap for the same reason. Archived tickets retain their view records. A future owner maintenance task can remove receipts for permanently deleted tickets, after checking the original ticket-list GUID and confirming deletion with elevated access. This change does not automatically delete any existing tracking data or configure a scheduled cleanup.

Validate in the deployed tenant with two ordinary test accounts: one account's open should not clear the other's dot, and each should be unable to read or edit the other's tracking rows via SharePoint. Local tests cover indexed batches, duplicate reconciliation, ownership checks, stale responses, revisit updates, UI error behavior and setup, but do not verify your live tenant permissions.

Microsoft references:
- https://support.microsoft.com/en-us/sharepoint/lists/data-and-lists/list-view-threshold-for-large-lists-and-libraries
- https://learn.microsoft.com/en-us/sharepoint/dev/schema/readsecurity-element
