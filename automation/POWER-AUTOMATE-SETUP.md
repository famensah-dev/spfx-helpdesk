# DeskPilot notifications: Power Automate deployment guide

DeskPilot saves settings; company Power Automate flows perform email delivery.
This guide and the setup JSON are reference material, NOT importable flow packages.
The app does not create flows, authorize Outlook or verify that a mailbox is connected.
Keep Email delivery disabled while configuring. Use a company-managed flow account.

## Preparation

1. Run Initialize workspace. It adds requester/email fields, the notification log, unique
   log Title keys, and version history on Tickets and TicketComments.
2. Download the setup reference for site/list IDs. The Notification Log and DeskPilot Access
   are private to site owners. The flow account needs access to their lists/items and tickets.
   Explicitly grant required access if the account is not an owner; do not make settings public.
3. Connect SharePoint and Office 365 Outlook in Power Automate. The Outlook connection account
   needs the appropriate shared-mailbox access and Send As permission for the support mailbox.
4. Configure the mailbox, helpdesk addresses, production page URL and templates in DeskPilot.
   Do not store passwords, tokens or HTTP trigger URLs in DeskPilot.

## Shared configuration read: use in EVERY collector and delivery flow

SharePoint Get items on DeskPilot Access: Filter Query Title eq 'Configuration', Top Count 2.
Require exactly one result. Name that action Get_configuration. Compose Settings:

json(first(body('Get_configuration')?['value'])?['Rules'])?['notifications']

Require Settings.version = 1 and Settings.enabled = true. A missing configuration means STOP.
Filter Settings.rules where item()?['event'] equals the event name; require exactly one result
and its enabled flag = true. Never substitute the downloaded setup JSON for live settings.
Use secure inputs/outputs on configuration actions because Rules also contains private roles.

## Flow 1: lifecycle collector

Trigger: SharePoint When an item is created or modified, on the Tickets list.
Use Get changes for an item or a file (properties only) with ID, Trigger Window Start Token
and End Token. Versioning must remain enabled. Preserve the source version/snapshot; the
latest Get item result must NOT stand in for an earlier event's data. If the trigger does not
expose a version-consistent snapshot, retrieve that item version through SharePoint HTTP.
Ignore versions from before the agreed notification go-live time.

Event conditions:
- created: initial item version (do not rely on Created = Modified).
- assigned: AssignedTo changed to a non-empty person; include a preassigned new ticket.
- escalated: Status changed to Escalated OR Escalated changed to true; emit only once.
- resolved: Status changed to Resolved or Completed. Normalize both statuses when comparing
  previous/current versions so a Completed-to-Resolved alias change does not email twice.
- closed: Status changed to Closed.
Ordinary title, attachment, summary and timestamp edits do not create lifecycle emails.
Creation and assignment may both fire for a preassigned ticket, using their separate rules.

Build recipient candidates using the enabled event rule:
- requester: RequestedBy.Email then RequesterEmail. For legacy app-created tickets only,
  Author.Email can be a fallback. Never use the intake flow account for Forms/email tickets.
- assignee: AssignedTo.Email.
- helpdesk: split Settings.helpdeskEmails on semicolons, commas or newlines.
Trim/lowercase, reject invalid addresses and de-duplicate. If EmailRequesterUpdates is false,
exclude the requester even when also listed among staff. Missing people are not substitutes
for another recipient. Report missing requester addresses for administrator review.

Create one Notification Log row per final recipient BEFORE sending:
- Title: sourceListId:itemId:sourceVersion:event:recipientIndex (255 characters maximum).
  Use a deterministic sorted recipient array from the source snapshot and keep it stable.
- TicketId, Event, SourceVersion, Recipients (ONE normalized address), DeliveryStatus=Pending.
- Payload: JSON string with recipientRole (requester/assignee/helpdesk) and plain-text values
  for ticketId, title, status, priority, assignee, requester, resolution, comment, ticketUrl.
  All values must describe the same source version; comment is empty for lifecycle events.
Title is unique. On duplicate-key create, find the existing row and STOP. Never reset it.
Retry a transient log-create error only with the SAME key and snapshot. If a source snapshot
cannot be reproduced, require manual review instead of creating another event.

## Flow 2: comment collector

Trigger: When an item is created on TicketComments (not modified).
Require SendToRequester = true and non-empty Content. Split TicketKey on ':'; validate its
list ID against the configured Tickets ID and its item ID as a positive integer.
Read the ticket and live settings. Use the comment rule and respect EmailRequesterUpdates.
Queue recipients as above. Event=comment; CommentId=comment item ID; Payload.comment=Content.
Use Comments list ID/item ID/version in the deterministic key.
This checkbox requests email, NOT private visibility; all comments keep their existing access.
Attachments are uploaded after comment creation. Send text and a ticket link; do not assume
files are ready on creation or send additional emails for each attachment upload.

## Flow 3: delivery worker

Trigger: Recurrence, for example every minute. Deploy only ONE worker, with concurrency 1.
Get Pending Notification Log rows in ID order; process a bounded batch.
Re-read live settings and current ticket preferences before each send. Skip disabled events
and opted-out requesters. Leave disabled pending work for deliberate cancellation/resumption;
review old Pending rows before enabling email to avoid sending stale notifications.

Claim Pending -> Processing using the row's SharePoint ETag and IF-MATCH. Skip conflicts.
Preserve original recipient/payload; do not add recipients because settings changed later.
Use the current event's subject/body templates and replace these plain-text tokens:
{{ticketId}}, {{title}}, {{status}}, {{priority}}, {{assignee}}, {{requester}}, {{resolution}},
{{comment}}, {{ticketUrl}}.
Build ticketUrl from Settings.appUrl. This app does not yet support an email deep-link query
parameter: link to the DeskPilot page and include the ticket number in the message.
HTML-escape the rendered plain text (& first, then < and >) and convert line breaks to <br>.
Never insert raw user-entered HTML in Outlook's HTML body.

Action: Office 365 Outlook Send an email from a shared mailbox (V2).
Original Mailbox Address=Settings.mailbox, To=row Recipients, Subject/Body=rendered templates.
Set the email action retry policy to None; an unknown result could otherwise send twice.
Confirmed send -> DeliveryStatus=Sent, SentAt=utcNow(). Known pre-send validation failure ->
Failed with LastError. Timeout, crash after claiming or ambiguous result -> Review, or leave
Processing if writing that state also fails. A failure to record Sent must NOT resend email.
Inspect Outlook sent items and flow run history before manually resetting a row to Pending.
Never automatically replay Sent/Review/Processing rows. Exactly-once mail is not guaranteed.

## Forms intake stays in Power Automate

When a new response is submitted > Get response details > your validation/approval steps >
SharePoint Create item. Set TicketSource=Forms, RequesterEmail=verified responder address,
EmailRequesterUpdates=the user's preference (default true), and resolve RequestedBy as a
SharePoint Person for internal users. Preserve Author as the actual flow account.
An anonymous form does not provide a verified identity; validate collected addresses using
your company's process. External senders can use RequesterEmail without a Person record.
ExternalRequestId=forms:formId:responseId helps find intake retries. Its index is NOT a unique
constraint: serialize intake or use a unique intake ledger to prevent concurrent duplicates.
Copy files with SharePoint attachment actions after creating the item.
Disable any separate Forms acknowledgment if created notifications are enabled here.

## Support mailbox intake stays in Power Automate

When a new email arrives in a shared mailbox (V2) > validate/filter > Create item.
Ignore your own support mailbox, delivery reports, auto-replies and automated notifications.
Map From -> RequesterEmail/RequestedBy, Subject -> Title, Body -> Description,
TicketSource=Email, ExternalRequestId=email:internetMessageId. Deduplicate before creation.
Copy allowed files and retain source message/conversation IDs for future reply matching.
Inbound replies to existing tickets are NOT implemented in this release. Do not treat reply
messages as new tickets until you configure reliable authenticated conversation matching.

## Test and enable

Restrict the flows to a controlled test ticket/recipient before enabling delivery for tests.
Verify created, reassigned, escalated, resolved, closed, comment checked/unchecked, requester
opt-out, disabled rules, ordinary edits, attachment retries, duplicate trigger replay,
concurrent edits and send failures. Compare Sent log rows with Outlook sent items.
Remove the test restriction deliberately, save the notification flow management link in
DeskPilot, and enable Email delivery. Confirm licensing/DLP policy with your company admin.

Microsoft references:
https://learn.microsoft.com/en-us/sharepoint/dev/business-apps/power-automate/sharepoint-connector-actions-triggers
https://learn.microsoft.com/en-us/connectors/office365/
https://learn.microsoft.com/en-us/power-automate/forms/get-started
