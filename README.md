# DeskPilot support portal

The primary deployment is now a SharePoint Framework (SPFx) full-page application. See [SharePoint deployment instructions](SHAREPOINT-DEPLOYMENT.md) for package installation, API approvals, page conversion, navigation settings and security requirements.

## Run and build

Use Node.js 22.14 or later within major version 22. Run these commands from the repository root:

```powershell
npm install
npm run build
```

The deployment package is `sharepoint/solution/spfx-helpdesk.sppkg`. For development, configure your tenant URL in `config/serve.json` and run `npm start`.

## SharePoint host

The app uses the current SharePoint site's URL and a configurable Tickets list name/ID. The default name is Issue Tracker. It connects directly to Microsoft Graph and SharePoint using the signed-in user's delegated authentication. It includes the shared ticket creation/editing, attachments, assignment search, FAQ, classification administration and SLA interface. Each department site's lists stay separate.

The manifest supports SharePointFullPage. Deploy as a SingleWebPartAppPage to remove the normal SharePoint page command bar. The site navigation can be disabled through site settings. Microsoft 365's global header and Discover/Publish/Build app bar remain host-managed.

SharePoint permissions enforce data access. The former Node.js API's Entra role and assigned-ticket policies do not run in this host. Configure and test list/item permissions before granting production access. Entra role management stays in the Entra portal; there is no cross-site membership manager in this version.

## Source layout

- `src/webparts/helpdeskSystem/components` and `pages`: shared React interface.
- `services/SharePointTicketService.ts`: SPFx authentication, site configuration and service composition.
- `services/graph`: Graph data services used by the SharePoint host.
- `interfaces`, `hooks` and `utils`: shared contracts and calculations.
- `azure-app`: retained standalone host and protected Node.js API; not required for the SharePoint deployment.

The standalone host remains documented in [azure-app/README.md](azure-app/README.md). No local credentials are included in the SPFx package.

Local build validation does not verify tenant permissions or the published SharePoint page layout. Follow the acceptance checks in the deployment guide.
