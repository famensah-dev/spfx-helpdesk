# Email and in-app notifications

The source supports Ticket Created, Ticket Assigned, Ticket Resolved (including Completed), and Ticket Closed. The package has not been rebuilt for this change.

## Setup after deployment

1. Approve the package's Microsoft Graph `Mail.Send` and `Mail.Send.Shared` requests in SharePoint API access. Only approve shared sending if you intend to use it.
2. Run **Initialize workspace** and reload DeskPilot. This adds **DeskPilot Email Settings** and **DeskPilot Notifications**. Existing ticket data is preserved. The notification key is unique and indexed to prevent duplicate submissions.
3. Open **Helpdesk Settings / Email & Notifications** as a Helpdesk Admin or Super Admin.
4. In **Sender Settings**, choose the signed-in user or a shared mailbox, optionally configure Reply-To, and check the full DeskPilot page URL. Ticket links preserve `env=WebView`.
5. Configure templates and recipients, save, and use **Send test to me**. Tests use example information and go only to the signed-in user's address.
6. Enable notifications and save. Notifications are disabled by default.

Sending from a shared mailbox additionally requires Exchange Send As or Send on Behalf rights for each user performing ticket actions. Setting an address does not grant mailbox permissions. Sending uses `/me/sendMail` with the shared From address.

## Rules and templates

Each event has separate email and in-app switches. To and CC can select the requester, creator, assigned agent, support team email, or acting user. Additional individual or distribution-list addresses can be entered. Requester and creator are treated separately. Team recipients use the ticket's assigned support team's email address; group addresses are not expanded into individual in-app recipients.

Available placeholders use double braces:

`{{TicketId}}`, `{{TicketTitle}}`, `{{Description}}`, `{{Status}}`, `{{Priority}}`, `{{Category}}`, `{{RequesterName}}`, `{{RequesterEmail}}`, `{{CreatorName}}`, `{{AssignedTo}}`, `{{AssignedToEmail}}`, `{{Team}}`, `{{TeamEmail}}`, `{{ResolutionSummary}}`, `{{TicketLink}}`, `{{WorkspaceName}}`, `{{ChangedBy}}`, `{{Event}}`.

Values are inserted as text into sanitized HTML. TicketLink becomes a clickable ticket link. Email subjects cannot contain line breaks. The editor provides a sample preview.

## Behavior and limits

- Notifications run for ticket creation, assignment, and status changes performed through DeskPilot. A created ticket that already has an agent can generate both Created and Assigned events.
- This is delegated Graph sending from the browser. Forms, direct SharePoint edits, imports outside DeskPilot, and background changes require Power Automate or another background process. Closing the browser during an action can interrupt notification processing.
- A notification failure does not undo a saved ticket. Warnings and history identify problems separately.
- History shows the latest 100 records. **Accepted** means Graph accepted the request, not that the recipient received it. Pending or unconfirmed submissions are not retried automatically because the original email may already have been sent.
- The bell polls while the page is visible. It shows addressed notifications only for tickets the current user's DeskPilot role can view. Read markers are local to this browser. It is an in-app inbox, not Teams or operating-system push notifications.
- The new lists inherit the site's existing SharePoint permissions. This feature does not grant site access or synchronize user permissions. Configure SharePoint access appropriately for notification content and settings.
- No tenant emails were sent during automated tests. Validate an actual test email after deployment and permission approval.

References: [Graph sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0), [sending from another mailbox](https://learn.microsoft.com/en-us/graph/outlook-send-mail-from-other-user).
