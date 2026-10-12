# DeskPilot — Internal Support Portal

The standalone Azure version is in [azure-app](azure-app/README.md). It uses Microsoft Entra sign-in and Microsoft Graph with your existing SharePoint lists, and fills the browser window without SharePoint navigation. The original SPFx host remains available.

An SPFx application with its own visual identity, based on the supplied reference: dark navy DeskPilot header, horizontal navigation, six colored summary cards, category doughnut and status bar charts. Microsoft 365 supplies its real global header; the application does not duplicate it or manipulate SharePoint's surrounding DOM.

## Stack and architecture

SPFx 1.23.2, React 17.0.1, TypeScript 5.8, Fluent UI 8, PnPjs 4, Chart.js 4 and react-chartjs-2 5. No new dependencies or authentication system. Existing build configuration and component IDs are preserved.

Under `src/webparts/helpdeskSystem`:

- `components`: React shell, application theme, root props, scoped SCSS and reusable CSS design tokens.
- `pages`: dashboard and read-only ticket views.
- `services`: SharePoint metadata validation and paged retrieval.
- `interfaces`: ticket and dashboard contracts.
- `hooks`: loading, refresh, filters, snapshot and derived statistics.
- `utils`: filtering, resolution statistics, global summary and category grouping.

Navigation switches React views without reloading SharePoint. Tickets provides searchable, paged read-only list data; My Board restricts that view by the signed-in user's email. Dashboard filters survive navigation. FAQs and Administration have explicit future-module views. Ticket creation, editing, resolution actions, permissions management and Power Automate workflows are not implemented.

The application uses its own light Fluent UI theme and scoped styles independently of the site theme. Layout fills its host, has a viewport-aware minimum height, uses natural document scrolling, and adapts to desktop, tablet and mobile. It does not force a regular SharePoint column to become full page.

## Single Part App Page hosting

The manifest includes `SharePointFullPage` in `supportedHosts` and enables `supportsFullBleed: true`. These settings serve different purposes: the former enables app-page hosting, while the latter allows placement in a full-width section where supported. Full bleed alone does not convert a page.

1. Build and upload `sharepoint/solution/spfx-helpdesk.sppkg` to the tenant or site collection app catalog. Deploy it and make it available to the target site.
2. From a modern site's **New > Page** experience, choose the DeskPilot application if offered by the tenant's page picker.
3. Alternatively, create a modern page named `Helpdesk.aspx`, add this web part as its only web part, save/publish it, and connect PnP PowerShell to that site with an organization-approved authentication method. Convert that page:

```powershell
Set-PnPPage -Identity 'Helpdesk.aspx' -LayoutType SingleWebPartAppPage
```

4. Open `SitePages/Helpdesk.aspx` directly and verify the full-page layout. Use a dedicated page: app pages host one web part and their layout cannot be edited in the browser. Restore an editable layout through administration tooling when changes to page composition are needed.

See [Microsoft's Single Part App Page documentation](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/web-parts/single-part-app-pages) and [full-width column documentation](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/web-parts/basics/use-web-parts-full-width-column).

SharePoint owns global navigation, the suite header and host-level controls. Their presence and appearance depend on the host and tenant. This app does not recolor, hide or replace that chrome. App pages provide supported layout control, not a standalone browser window. Full-width sections are a separate communication-site capability, and the workbench cannot validate their layout. Test the actual published app page in the tenant.

## Tickets list schema

Use a list named **Tickets** on the hosting site:

| Column | Type | Values / behavior |
| --- | --- | --- |
| Title | Single line of text | Subject |
| Status | Choice | New, In Progress, Resolved, Closed; optionally Pending and Escalated |
| Priority | Choice | Low, Medium, High, Critical |
| AssignedTo | Person or Group | Single person selection |
| Category (optional) | Choice or Single line of text | Organization-defined categories |
| Escalated (optional) | Yes/No | Escalation flag |
| DueDate (optional) | Date and Time | Due timestamp |
| ResolvedAt (optional) | Date and Time | Actual resolution timestamp |

Created and Modified are built in. The service resolves actual internal names from metadata, preferring internal-name matches and then display-name matches. Existing columns are not modified. Configure optional columns/statuses in SharePoint if needed; unsupported types or ticket choice values produce an explicit error.

## Metrics and filters

The dashboard starts on This Month, using the current browser-local calendar month and ticket creation date. All Time and custom date filters are available. Status, priority and assignee filters apply consistently to all dashboard metrics and charts. The selected end day is inclusive.

- Total: all matching tickets.
- Open: matching tickets whose status is neither Resolved nor Closed, including Pending and Escalated.
- Pending: matching tickets with Pending status; unavailable if that choice is not configured.
- Closed: matching tickets with Closed status.
- Escalated: matching tickets flagged Escalated or having Escalated status, counted once. Unavailable without either supporting schema option.
- Overdue: unresolved matching tickets whose valid DueDate is before the current time. Unavailable without that column. Configure date and time values; no implicit SLA is assumed.

Unavailable metrics show a dash instead of invented counts. The category chart needs Category; empty values are grouped as Uncategorized. More than eight categories are consolidated into seven categories plus Other categories, retaining the full total. Hover chart elements for labels and counts; accessible canvas descriptions also expose the values.

Filters and the original resolution and priority insights remain available in expandable sections below the main charts. New/In Progress open totals remain in the statistics utilities. Resolution metrics use only actual ResolvedAt values, excluding invalid and negative resolution durations. Modified is never substituted. Workflow owners must populate ResolvedAt and DueDate; this release does not create flows or backfill historical data.

## Data handling

PnPjs uses the current SPFx user's Microsoft 365 authentication and existing list/item permissions. All accessible tickets are loaded in pages of 1,000 without a fixed 5,000-item truncation. Client-side filtering/aggregation may need server-side replacement for very large lists. Errors never fall back to sample data. A failed refresh leaves the previous snapshot visible with an error and its last-refresh timestamp.

## Validation and deployment

Use Node 22.14 or later within major version 22.

```sh
npm install
node tests/dashboard.cjs
node tests/ticketService.cjs
npm run build
```

For development, configure your tenant workbench in `config/serve.json`, then use `npm start`. The generated package is `sharepoint/solution/spfx-helpdesk.sppkg`.

Tenant checks after deployment:

- Confirm the app-page layout and real Microsoft 365 header, then resize to desktop, tablet and mobile widths.
- Compare cards, chart tooltips and filtered counts with the Tickets list.
- Verify Pending, Category, Escalated and DueDate behavior with and without optional schema.
- Check Tickets search/pagination, My Board assignment matching and navigation without a SharePoint reload.
- Confirm resolution timestamps, empty results, denied list access, failed refresh and retry behavior.

Local compilation and calculation tests do not validate tenant connectivity or visual rendering inside SharePoint.


## Debug manifests fail to load

The SPFx 1.23 debug manifest URL is `https://localhost:4321/temp/build/manifests.js`. Keep `npm start -- --nobrowser` running while debugging and wait for successful compilation. Open that URL directly in the same browser profile used for SharePoint; it should show JavaScript.

If the direct URL loads but SharePoint reports a script error, check the SharePoint site's browser permissions for Local network access. Current Edge and Chrome require permission for SharePoint to fetch localhost resources. Allow this permission for the development SharePoint site and reload. Do not disable browser security globally. See [Microsoft's debugging guidance](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/debug-modern-pages).

If the browser instead reports a certificate error, use `npx heft trust-dev-cert` to trust the SPFx development certificate, following your organization's certificate policy, and restart the browser. If the URL reports connection refused, start the development server. If it returns 404, confirm that the correct project is being served and use the debug URL printed by Heft. A production `npm run build` creates a package; it does not keep a debug server running.

For a deployed app, open its SharePoint page without local `debugManifestsFile` parameters to use the packaged assets.


