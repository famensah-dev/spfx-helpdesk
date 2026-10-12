# DeskPilot ticket editing and comments

Ticket details now support editing the issue title, description, priority, status and assigned person. The assignment picker currently offers people already assigned to loaded tickets. Other list fields, file attachments and related issues are not editable here yet.

Ticket updates and comment posting require DeskPilot's selected-site **write** grant and the signed-in user's permission to add/edit list items. The previously reported 403 must still be resolved in the tenant; these changes do not bypass permissions.

## Set up DeskPilot comments

Comments use a separate Microsoft List. Existing SharePoint-native item comments are not imported or shown in this conversation feed.

1. Open `https://archwaysdigitalgh.sharepoint.com/sites/ithelpdesk`.
2. Go to **Settings → Site contents → New → List → Blank list**.
3. Name it exactly **TicketComments**.
4. Keep the built-in **Title** column.
5. Add **TicketKey**, type **Single line of text**.
6. Add **Content**, type **Multiple lines of text**, configured as **Plain text** without append-only history.
7. Open **List settings → Indexed columns → Create a new index**, select **TicketKey**, and create the index.
8. Give appropriate support users access to this list. Comments inherit the comments list's permissions, not the individual issue's permissions. If tickets have restricted item-level visibility, align the comment permissions before using this feed for sensitive conversations.
9. Refresh DeskPilot's Tickets page, open a ticket, and refresh the comments panel.

DeskPilot stores a compound key containing the issue list's ID and ticket ID, so identical ticket numbers from different lists do not mix. Author and time come from SharePoint's server-created metadata. Posting never sends a client-supplied author.

No list was created automatically. The panel reports missing setup or permission errors explicitly instead of showing a false empty conversation. If the save result is uncertain after a network interruption, refresh before retrying to avoid duplicates.
