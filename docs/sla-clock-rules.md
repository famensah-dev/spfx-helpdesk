# SLA clock rules

Settings > SLA & Priorities stores the clock rules for the whole workspace. The initial schedule is Monday–Friday, 08:00–17:00, UTC. Business-hours counting is off by default. Hours, weekdays and IANA time zone are configurable. Holidays and overnight shifts are not modeled.

All targets remain stored as whole minutes. The UI displays hours/minutes and accepts either unit. Active switches save immediately; clock rules have a Save action. A 75% at-risk threshold is enabled by default and can be adjusted or disabled. Completed targets are still Met/Breached, rather than At risk.

Clock rules are a reserved `__DeskPilotSlaClock` row in Ticket Priorities, with JSON in `SlaClockRules`. It is excluded from priority choices and the SLA table. Saving rules requires the existing Manage Lists authorization, and adds missing configuration/pause columns without replacing existing columns or targets.

## Pending pauses

Enabling this rule adds a plain multiline-text `SlaPauseIntervals` column to Tickets. New tickets created by DeskPilot then initialize it to `[]`. Pending entry and exit append/close UTC intervals in the same version-checked patch as the status change:

```json
[
  { "start": "2026-11-04T10:00:00.000Z", "end": "2026-11-04T11:00:00.000Z" },
  { "start": "2026-11-04T14:00:00.000Z" }
]
```

Only one interval can remain open. Historical tickets without known pause history score Unknown when pause counting is enabled. DeskPilot does not guess previous Pending time. External automations creating new tickets should initialize this field to `[]`; automations changing status must maintain the intervals and use concurrency protection. Inconsistent history remains Unknown. When business hours are enabled, only scheduled time inside a pause is subtracted.

## Breach notifications

The Notify Team Lead switch enables checks while a Helpdesk Admin or Super Admin has DeskPilot open and visible. Checks run every minute, including while viewing other pages, without refreshing the current form. They examine accessible, unarchived, open tickets. An assigned support team and configured team lead with a valid email address are required.

Enable Ticket Notifications in Email & Notifications. The SLA Breach email template is editable in Email Templates; older saved email settings receive this default template automatically. Breach alerts go only to the matched team lead, independently of the ticket/requester recipient selections. The default sends email and creates an in-app record; normal SharePoint and DeskPilot visibility restrictions still apply to the inbox.

Each ticket/target kind (response or resolution) gets one claim in the existing notification log. The log's unique NotificationKey prevents concurrent open clients from sending duplicates. Failed or unconfirmed submissions are retained and never retried automatically. Changing targets or reopening a ticket does not reset its breach claim.

This is browser-driven checking, not unattended scheduling. It cannot send when no authorized client is open, and it does not replace background automation for guaranteed deadlines. No Azure endpoint or Power Automate flow is deployed by this change.
