# DeskPilot security audit

Date: 27 October 2026 (UTC)  
Assessment: source/configuration review, dependency advisory checks, existing tests, and local mock reproductions.  
Overall assessment: **High risk until the authorization and permission findings below are addressed or explicitly accepted with verified tenant controls.**

## Executive assessment

DeskPilot has useful defensive controls, including delegated Microsoft access, protected private role projections, Graph destination checks, rich-text sanitization, and a separate Azure API that validates tokens and enforces roles. No critical exploit, authentication bypass, embedded production credential, or successful XSS was confirmed in this review.

The principal issue is that the deployed SharePoint/SPFx architecture does not enforce its ticket visibility and action rules outside the browser. A user with list-wide SharePoint rights can exercise those rights through Microsoft APIs even when DeskPilot hides the corresponding records or actions. New supporting lists inherit permissions without an application-specific ACL policy, exposing additional configuration and confidentiality risks. An independently reproduced race can restore revoked user projections and group membership intent when two owners reconcile different configuration versions.

These findings do **not** establish that an outsider can access your tenant, that a breach occurred, or that your existing tenant ACLs are definitely permissive. The report identifies confirmed implementation behavior and states the required environmental conditions for exploitation.

## Scope and boundaries

Reviewed the current working tree, including existing staged invitation changes:

- SPFx bootstrapping, React routes/pages/components, ticket forms and detail workflows.
- SharePoint access configuration, per-user projections, group synchronization, setup, maintenance, role wrappers, ticket/comment/attachment services.
- Microsoft Graph client, scopes, directory search, email templates, notification history, invitations, support-team routing, KB/FAQ, classifications, SLA and exports.
- Standalone Azure frontend, MSAL configuration, Node HTTP API, JWT validation, on-behalf-of exchange, RPC dispatch, Entra role administration and audit writing.
- Package manifests/lockfiles, ignored secret paths, deployment documentation, Static Web Apps headers, and Bicep infrastructure.

The two architectures are distinct:

| Host | Authentication | Application authorization | Data enforcement |
| --- | --- | --- | --- |
| SharePoint/SPFx | SharePoint session and SPFx delegated token provider | Site-local roles loaded into browser wrappers | SharePoint site/list/item ACLs; app rules do not run on a server |
| Standalone Azure | MSAL API token; Node validates signature/issuer/audience/tenant/client/scope | Entra roles plus server-side RPC/ticket checks | API checks and delegated SharePoint rights; direct Microsoft access still follows SharePoint ACLs |

No live tenant session was available. No permission changes, emails, deployments, destructive tests, public scans, or production API probes were performed. No application implementation was changed during the audit. Only this report and its local reproduction script were added. Existing staged changes were preserved.

Not verified: deployed package/version, actual tenant consent, effective ACLs and sharing links, Conditional Access/MFA, Exchange sender permissions and mail-flow/DLP policies, Power Automate flow definitions/connections, Azure runtime/proxy controls, secret rotation, private ignored environment-file contents, Git history, binary seeder contents, retention/backup/incident response, and runtime malware scanning. This is not a penetration-test certificate or a claim of exhaustive absence of vulnerabilities.

## Findings register

Severity reflects expected impact and preconditions rather than a formal CVSS score. Related findings are grouped by the control that needs fixing; some share the same underlying SharePoint permission dependency.

| ID | Severity | Finding | Evidence status |
| --- | --- | --- | --- |
| DP-01 | High | Ticket isolation and action restrictions are client-side in SPFx | Local reproduction; tenant impact depends on data ACLs |
| DP-02 | High | Supporting configuration lists lack an enforced privilege boundary | Source confirmed; tenant ACL verification required |
| DP-03 | High | Stale owner reconciliation can restore revoked access | Local concurrency reproduction |
| DP-04 | Medium | Unpublished KB and notification metadata are downloaded before filtering | Source confirmed; tenant ACL verification required |
| DP-05 | Medium | Ticket close policy differs between single, bulk, and Azure paths | Local reproduction |
| DP-06 | Medium | Broad delegated permissions increase the shared SPFx trust surface | Manifest confirmed; live grants unknown |
| DP-07 | Medium | Authorization and updates can use different ticket versions | Source confirmed; race not tested live |
| DP-08 | Medium | Security audit coverage and notification-log integrity are incomplete | Source confirmed; tenant audit settings unknown |
| DP-09 | Medium | Azure API has no application rate/concurrency quotas and accepts large bodies | Source confirmed; upstream controls unknown |
| DP-10 | Medium | Attachment checks do not establish file safety | Control gap; no malicious-file exploit claimed |
| DP-11 | Low | Standalone frontend lacks a configured CSP | Configuration confirmed |
| DP-12 | Low | Email app links accept arbitrary HTTP/HTTPS destinations | Validation confirmed; privileged/compromised configuration required |

## Detailed findings

### DP-01 — SPFx application roles do not enforce data isolation

Evidence: [appRoleRules.ts:16](../../src/webparts/helpdeskSystem/services/appRoleRules.ts#L16), [appRoleRules.ts:28](../../src/webparts/helpdeskSystem/services/appRoleRules.ts#L28), [GraphTicketService.ts:495](../../src/webparts/helpdeskSystem/services/graph/GraphTicketService.ts#L495), [SharePointTicketService.ts:41](../../src/webparts/helpdeskSystem/services/SharePointTicketService.ts#L41), [SharePointGroupAccess.ts:72](../../src/webparts/helpdeskSystem/services/SharePointGroupAccess.ts#L72).

The ticket service requests every ticket SharePoint permits, including description and resolution fields; only afterward does the browser filter to the user's app scope. The guarded object also has the unrestricted source as its JavaScript prototype. That prototype behavior makes the limitation easy to demonstrate, but replacing the wrapper would not secure direct API access either.

**Precondition and impact:** an agent, disabled app user, or other site user retains broader list/item Read/Edit rights than their intended DeskPilot scope. They can read records omitted from the UI or change fields/actions the UI prohibits. Removing a DeskPilot role does not revoke unrelated direct, Members, Owners, Microsoft 365, sharing-link, or other group permissions. Site-level Read grants can expose any inheriting list; Contribute normally includes item deletion. `env=WebView` only changes presentation.

The audit mock receives two tickets in the underlying service but returns one through the role wrapper; its prototype still returns both. No live tenant data was accessed.

**Remediation:** first decide whether assigned-only/own-only views are convenience filters or confidentiality requirements. For confidentiality, enforce matching permissions on tickets **and** comments/attachments, including assignment/reassignment, requester, team, archival and revocation transitions. Alternatively use a trusted authorization service with data access that users cannot bypass independently; merely adding a delegated backend while leaving broader direct rights does not solve direct access. Restrict site-wide grants and validate effective access with ordinary accounts. Do not describe UI controls as security enforcement.

### DP-02 — Supporting configuration inherits ordinary site permissions

Evidence: [WorkspaceSetupService.ts:17](../../src/webparts/helpdeskSystem/services/WorkspaceSetupService.ts#L17), [WorkspaceSetupService.ts:107](../../src/webparts/helpdeskSystem/services/WorkspaceSetupService.ts#L107), [GraphNotificationService.ts:25](../../src/webparts/helpdeskSystem/services/graph/GraphNotificationService.ts#L25), [GraphNotificationService.ts:64](../../src/webparts/helpdeskSystem/services/graph/GraphNotificationService.ts#L64), [GraphSupportUnitsService.ts:162](../../src/webparts/helpdeskSystem/services/graph/GraphSupportUnitsService.ts#L162).

Setup creates generic lists without breaking inheritance or applying a resource-specific authorization policy. In contrast, `DeskPilot Access` is explicitly secured. Email settings, support-team configuration, members, comments, and notification logs do not receive equivalent purpose-specific protections. Browser `canManage` checks do not prevent direct list writes.

**Precondition and impact:** a lower-trust user has inherited Edit/Contribute/custom Edit Items rights on these resources. They can change notification configuration, team membership/category routing, or log records directly. Modifying additional email recipients/templates could cause later ticket actions by another user to send ticket information to an unwanted address. This is configuration tampering crossing a privilege boundary, not a demonstrated live exfiltration.

Round-robin currently updates `LastMemberId` on the same team item that stores routing configuration. Giving ordinary ticket creators write access for cursor updates also gives them item-level write access to the other fields; hiding controls does not separate those powers.

**Remediation:** provision and verify an ACL matrix for every list before enabling it. Make configuration readable only as needed and editable only by approved operators. Separate mutable routing state from administrative configuration or run rotation in trusted automation. Separate notification submission from administrative configuration/log mutation so securing the latter does not break ordinary ticket actions. Preserve existing ACLs through an explicit, reviewed migration rather than silently resetting production lists.

### DP-03 — Concurrent reconciliation can restore revoked users

Evidence: [SharePointRoleManagement.ts:141](../../src/webparts/helpdeskSystem/services/SharePointRoleManagement.ts#L141), [SharePointRoleManagement.ts:146](../../src/webparts/helpdeskSystem/services/SharePointRoleManagement.ts#L146), [SharePointRoleManagement.ts:87](../../src/webparts/helpdeskSystem/services/SharePointRoleManagement.ts#L87), [SharePointRoleManagement.ts:102](../../src/webparts/helpdeskSystem/services/SharePointRoleManagement.ts#L102), [SharePointRoleManagement.ts:156](../../src/webparts/helpdeskSystem/services/SharePointRoleManagement.ts#L156).

Configuration saves use an ETag, but projection/group reconciliation uses the previously loaded configuration without a serialized ownership/version mechanism. Owner `load()` also performs reconciliation writes. Projection updates use wildcard ETags.

**Confirmed sequence:** owner A reads configuration granting user 7, then pauses; owner B saves a configuration removing user 7 and removes their projection/membership; owner A continues reconciling the old snapshot and recreates their projection and group membership intent. The authoritative configuration still says the user is removed. Nonowner startup trusts the recreated projection, so this can defeat the removal until a subsequent correct reconciliation.

The included mock exercises the actual `load`, `save`, and `sync` control flow and confirms this result. Group changes are modeled locally, not applied to SharePoint.

**Remediation:** serialize configuration-to-access reconciliation across sessions using a trusted coordinator/lease and configuration revisions; record which revision produced each projection. A reload-only fix or a single version check is insufficient if a concurrent save can still interleave. Design partial-failure recovery to fail closed for removals, and add this sequence as a regression test. Avoid mutation-heavy reconciliation on ordinary owner reads without coordination.

### DP-04 — Hidden draft and notification data is fetched before filtering

Evidence: [GraphFaqService.ts:86](../../src/webparts/helpdeskSystem/services/graph/GraphFaqService.ts#L86), [GraphFaqService.ts:87](../../src/webparts/helpdeskSystem/services/graph/GraphFaqService.ts#L87), [GraphNotificationService.ts:52](../../src/webparts/helpdeskSystem/services/graph/GraphNotificationService.ts#L52), [GraphNotificationService.ts:58](../../src/webparts/helpdeskSystem/services/graph/GraphNotificationService.ts#L58).

Published-only KB mode downloads all readable FAQ items and filters `Active` afterward. The SPFx notification inbox downloads recent log records, including subjects, audiences and errors, before filtering against user email/ticket visibility. Admin-only History UI does not prevent that download.

**Precondition and impact:** these lists permit broad reading. An ordinary user can inspect draft articles, other recipients, ticket subjects and operational error metadata in responses even though the corresponding UI is hidden. The Azure RPC filters return values on the server, which improves browser response isolation, but direct Microsoft access still follows list ACLs.

**Remediation:** server-side query filters reduce unintended response data but are not sufficient against direct queries by a broadly authorized user. Use publication security/draft protection or distinct restricted draft storage, and per-recipient notification storage/ACLs or a protected inbox API. Keep administrative delivery errors out of recipient-facing records.

### DP-05 — Close-ticket authorization is inconsistent

Evidence: [appRoleRules.ts:44](../../src/webparts/helpdeskSystem/services/appRoleRules.ts#L44), [appRoleRules.ts:51](../../src/webparts/helpdeskSystem/services/appRoleRules.ts#L51), [authorization.mjs:17](../../azure-app/server/authorization.mjs#L17), [dispatch.mjs:36](../../azure-app/server/dispatch.mjs#L36).

The SPFx single-ticket edit wrapper denies an agent changing a ticket to Closed, while bulk status updates check only the general status action and ticket scope. A default Agent is therefore denied by one path and allowed by another. Azure status authorization also permits assigned agents to close tickets. Existing UI resolution-summary prompts are not a common mutation-layer invariant either.

**Impact:** users can bypass the application's stated closure policy through another operation. This is narrower than DP-01: it is reproduced through the app's own guarded bulk interface without bypassing the wrapper.

**Remediation:** define one transition policy, including who can resolve, close and reopen and whether a summary is required. Apply it to single edits, bulk actions and API routes; enforce externally where a real security boundary is required. Confirm the intended policy before changing existing operator behavior.

### DP-06 — Broad delegated consent expands the trust surface

Evidence: [package-solution.json:8](../../config/package-solution.json#L8), [package-solution.json:16](../../config/package-solution.json#L16), [SharePointTicketService.ts:44](../../src/webparts/helpdeskSystem/services/SharePointTicketService.ts#L44).

The package requests Graph `Sites.Manage.All`, `User.Read.All`, `Mail.Send`, `Mail.Send.Shared`, and SharePoint `AllSites.Manage`. The runtime config says `Sites.Selected`, but that string does not restrict the token. The actual granted scopes and resource permissions determine access.

Standard SPFx API permissions are granted through the shared SharePoint client-extensibility principal, not uniquely to this package. Delegated permissions remain bounded by the signed-in user's Microsoft permissions; this is **not** application-only access to every mailbox or site. Nevertheless, compromised trusted browser code running under a privileged user has a broad potential impact. Microsoft documents this [SPFx shared-consent behavior](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/use-aadhttpclient).

**Remediation:** inventory actual grants and other solutions sharing the principal; remove unused scopes explicitly in tenant administration. Keep shared-mailbox scope only if that feature is used. Separate privileged schema/provisioning operations where practical, and evaluate selected-resource permissions with the required consent, resource assignments and issued tokens. Do not assume changing `graphSiteScope` or deleting a package revokes consent. See Microsoft's [Selected permissions model](https://learn.microsoft.com/en-us/graph/permissions-selected-overview).

### DP-07 — Ticket mutations are vulnerable to stale authorization and lost updates

Evidence: [dispatch.mjs:17](../../azure-app/server/dispatch.mjs#L17), [dispatch.mjs:35](../../azure-app/server/dispatch.mjs#L35), [GraphTicketService.ts:97](../../azure-app/src/services/GraphTicketService.ts#L97), [GraphTicketService.ts:170](../../azure-app/src/services/GraphTicketService.ts#L170), [GraphTicketService.ts:201](../../src/webparts/helpdeskSystem/services/graph/GraphTicketService.ts#L201), [GraphTicketService.ts:329](../../src/webparts/helpdeskSystem/services/graph/GraphTicketService.ts#L329).

Azure authorizes against one loaded ticket snapshot and then writes without requiring the same ETag. Reassignment or a lifecycle change can occur between those operations. Most SPFx edits and bulk updates also omit an ETag; the source-field edit case has a narrower conditional version guard.

**Impact:** stale edits can overwrite newer status/assignment/priority values. A previously assigned Azure agent can complete a request after reassignment if underlying SharePoint rights still permit the write. This is an authenticated concurrency condition, not a proven cross-user exploit on the tenant.

**Remediation:** authorize against the exact item version being modified, write with its ETag, and re-read/re-authorize on conflicts. Use per-item expected versions for bulk operations and do not automatically replay privileged actions against changed ownership/state.

### DP-08 — Audit coverage and log integrity are incomplete

Evidence: [GraphNotificationService.ts:117](../../src/webparts/helpdeskSystem/services/graph/GraphNotificationService.ts#L117), [GraphNotificationService.ts:124](../../src/webparts/helpdeskSystem/services/graph/GraphNotificationService.ts#L124), [SharePointRoleManagement.ts:149](../../src/webparts/helpdeskSystem/services/SharePointRoleManagement.ts#L149), [entraUsers.mjs:77](../../azure-app/server/entraUsers.mjs#L77), [index.mjs:27](../../azure-app/server/index.mjs#L27).

The Azure Entra-assignment service records attempts/results and fails closed if the audit attempt cannot be stored, which is a useful control. Equivalent durable application security events were not found for SPFx role/group changes, notification recipient/template changes, maintenance operations, or access denials. Notification history is ordinary mutable SharePoint content rather than a tamper-resistant security ledger.

**Impact:** if list rights permit editing/deleting history, a user can alter delivery evidence or pre-create a notification key to suppress a later notification. Tenant audit/versioning may supply additional evidence, but its configuration and retention were not available for verification. The Azure local JSONL audit file also needs production persistence, access controls, collection and retention.

**Remediation:** collect security-relevant actor/target/action/configuration-revision/result/correlation events in protected durable storage; centrally retain and monitor them. Verify Purview/Entra/Exchange audit capabilities and retention. Separate notification idempotency state from user-writable records and log sensitive changes without copying token values or full ticket bodies.

### DP-09 — Azure abuse controls rely on unverified infrastructure

Evidence: [index.mjs:47](../../azure-app/server/index.mjs#L47), [index.mjs:61](../../azure-app/server/index.mjs#L61), [dispatch.mjs:5](../../azure-app/server/dispatch.mjs#L5), [GraphTicketService.ts:314](../../azure-app/src/services/GraphTicketService.ts#L314), [main.bicep:10](../../azure-app/infra/main.bicep#L10).

After authentication, the API buffers up to 72 MiB, concatenates/parses JSON, and can decode multiple base64 attachments. No per-user request rate, concurrent request quota, or application-wide work limit was found. Several methods load all tickets or related list entries on each request. Bicep provisions a static site but does not establish production API protection, rate limits or secret management.

**Impact:** an authenticated user can consume memory, CPU and Microsoft API quotas disproportionately; concurrent requests amplify the existing body limit. No load attack was executed. Reverse-proxy/WAF controls may mitigate this but were not verified.

**Remediation:** use small operation-specific limits, streaming or direct controlled upload where appropriate, per-identity throttling, bounded concurrency and Graph work budgets. Apply edge limits and TLS termination for deployed APIs. Paginate/scoped-query list access, cancel downstream work after disconnection, and require runtime input schemas for each RPC method. Do not treat Origin validation as rate limiting or as authorization for nonbrowser clients.

### DP-10 — Upload validation is metadata-based

Evidence: [ticketAttachments.ts:2](../../src/webparts/helpdeskSystem/utils/ticketAttachments.ts#L2), [SharePointAttachments.ts:35](../../src/webparts/helpdeskSystem/services/graph/SharePointAttachments.ts#L35), [dispatch.mjs:4](../../azure-app/server/dispatch.mjs#L4).

File count, size, names and extensions are checked, but no content-signature inspection, macro policy or application malware scanning is implemented. A renamed file can satisfy the metadata checks, and permitted legacy `.doc` files may contain active content. SPFx validation also cannot restrict direct SharePoint upload operations by an otherwise authorized user.

**Impact:** allowed extension does not establish that an attachment is harmless. This is a defense gap, not a claim that a tested file bypassed SharePoint/Microsoft Defender scanning or executed code.

**Remediation:** verify actual SharePoint/Defender protection, scanning behavior before download, Safe Attachments where applicable, and tenant block policies. Consider removing legacy `.doc`, quarantine high-risk uploads, and enforce essential policy in the storage/trusted upload layer. Retain existing count/name/size checks. Validate ticket/comment attachment ACLs with DP-01.

### DP-11 — Standalone frontend lacks a configured Content Security Policy

Evidence: [staticwebapp.config.json:12](../../azure-app/public/staticwebapp.config.json#L12), [MicrosoftAuth.ts:12](../../azure-app/src/auth/MicrosoftAuth.ts#L12).

Static Web Apps headers include nosniff, a referrer policy, and frame denial, but no CSP. MSAL uses sessionStorage; any future same-origin script execution could access browser-held credentials or act as the signed-in user. No such execution was confirmed here, and SPFx hosting headers are controlled by SharePoint rather than this static-site file.

**Remediation:** deploy a tested report-only CSP, then enforce appropriate script/connect/frame/object/base/form restrictions for the standalone host. Verify Entra sign-in and required assets before enforcement. Prefer maintained sanitization and keep adversarial regression tests; a CSP is defense in depth, not a replacement for output safety.

### DP-12 — Notification links are not constrained to the intended app

Evidence: [emailTemplates.ts:23](../../src/webparts/helpdeskSystem/utils/emailTemplates.ts#L23), [emailTemplates.ts:14](../../src/webparts/helpdeskSystem/utils/emailTemplates.ts#L14), [emailTemplates.ts:47](../../src/webparts/helpdeskSystem/utils/emailTemplates.ts#L47).

Configured app URLs permit HTTP and arbitrary hosts, and template links can point externally. A legitimate or compromised configuration editor can make trusted notification messages direct users to a different site or an unencrypted destination. This is not an unauthenticated redirect endpoint, and invitations contain no password or bearer-token URL.

**Remediation:** require HTTPS outside explicitly allowed local development, validate app URLs against approved tenant/app destinations, and make intentional external links clear. Protect configuration as in DP-02; consider external-recipient/domain policy and approval for templates containing ticket descriptions or resolution details.

## Controls that worked in the reviewed paths

- The SPFx host uses delegated SPFx tokens; it does not embed a client secret. Nonowners load only their private projection and cannot use the normal role-management save path. The role list/item ACL routine removes obsolete broad grants and grants user Read, not write. Missing/invalid assignments fail closed in normal startup.
- The Graph clients reject unexpected origins/API paths before sending tokens. Audited directory filters escape apostrophes and use URLSearchParams. IDs and classification relationships receive validation in mutation paths.
- Representative script, event-handler, SVG, iframe, data-URL and JavaScript-link payloads were removed by the rich-text sanitizer. Markdown rendering uses React text nodes and restricts links. Email substitutions are text nodes; exports escape markup, store XLSX cells as text, and guard common CSV formula prefixes. These observations do not prove coverage of every browser parser edge case.
- Attachments have count/size/name/extension checks, collision hashing, ticket binding and comment-retry ownership checks. Automatic writes/email are not blindly retried after uncertain responses. Notification keys are unique in initialized schema.
- Azure JWT verification checks RS256 signature, configured issuer/audience, expiry, tenant, user ID, authorized client and delegated scope. The server cross-checks Graph `/me` against the token user, uses an allowlisted RPC switch, denies missing roles, checks ticket access, and restricts schema and Entra-assignment routes.
- Entra role management is bound to the fixed application/resource, protects Super Admin targets and self-changes, rechecks the operator's direct Super Admin assignment for writes, and records audit attempts/results. OBO secrets stay server-side and the API listens on loopback by default.
- Default invitation mode is manual. Invitations go only to the chosen user; tests go only to the operator. The link preserves `env=WebView`. Sending is not a tenant-user creation or authentication invitation mechanism.

## Validation performed

| Check | Result |
| --- | --- |
| All 15 `tests/*.cjs` scripts | Passed; existing Router/icon warnings appeared |
| `node tests/sharepoint-roles.test.mjs` | 12 passed |
| `npm test` in `azure-app` | 60 passed after rerunning outside the sandbox; initial sandbox run could not spawn Node workers |
| `node security-audit/2026-10-27/reproduce.cjs` | Passed; confirmed DP-01, DP-03, DP-05 and positive sanitizer/Graph-origin controls |
| Root `npm audit --json` | 0 reported advisories; 1,379 dependency inventory entries reported by npm |
| Azure `npm audit --json` | 0 reported advisories; 96 dependency inventory entries reported by npm |
| Pattern scan of 157 tracked/unignored text/config files | No embedded credential confirmed; two matches were a documented placeholder and an environment-variable reference |
| Tracked sensitive filename check | Only `.env.example` templates found among scanned sensitive names; no tracked private-key/environment-secret file identified |

The credential scan did not inspect ignored local secret contents, historical commits or workbook binaries. Dependency checks are point-in-time registry advisory results, not a guarantee of safe dependencies. Node/MSAL/runtime support status and deployed versions need deployment inventory validation.

The reproduction script uses mocks and assertions; it does not contain live credentials or invoke tenant services. It intentionally asserts current unsafe behavior for the confirmed findings, so expected results must change when fixes are implemented. It is an audit artifact, not a passing security gate indicating the application is secure.

The normal SPFx production-build script invokes Heft/Jest, but the bespoke `.cjs` scripts are separate and must be run explicitly. No production build/package was generated for this documentation-only audit.

## Prioritized remediation

1. **Before expanding production access:** document the real confidentiality model and verify effective ACLs for tickets, comments, files, configuration, KB drafts and notifications. Remove inappropriate broad access only through a reviewed tenant change. Do not grant site-wide Edit/Contribute merely to make an app feature function.
2. **First implementation fixes:** coordinate access reconciliation (DP-03); unify close/resolve/reopen rules (DP-05); protect configuration and separate routing cursor state (DP-02); enforce an actual data boundary where required (DP-01/DP-04).
3. **Next:** implement version-bound authorization/updates, protected auditing, scoped consent review, and operation-specific quotas. Evaluate required mail recipients and permitted sensitive placeholders before enabling automation widely.
4. **Hardening:** verify malware/DLP, secret rotation, CSP, HTTPS app-link allowlists, lifecycle revocation, retention and backup recovery. Retest fixes with ordinary accounts and direct API access as well as the UI.

## Tenant acceptance matrix

Use a dedicated test site and approved test accounts; inspect actual effective permissions rather than only observing hidden buttons.

| Account/scenario | Required evidence |
| --- | --- |
| Unassigned site user | DeskPilot startup denied; direct list/item access matches your intended policy |
| Agent assigned one ticket | Direct ticket, comment, attachment and history access for another user's ticket denied if assigned-only is a security requirement |
| Agent with ordinary ticket editing | Direct edits to email configuration, routing policy, user projections and admin logs denied |
| Draft KB reader | Unpublished article bodies absent from readable storage/API responses unless explicitly permitted |
| Notification recipient | Other recipients' subjects/audiences/admin errors not downloadable |
| Agent single and bulk status requests | Same resolve/close/reopen/summary policy enforced for both and for direct writes |
| Two owner sessions | Pause stale load, revoke user in other session, resume: user remains revoked and cannot reload with a recreated role |
| Disabled/removed user with another group grant | Document retained unrelated access; verify required revocation across direct grants, sharing, site groups and existing sessions |
| Reassignment while an update is pending | Prior assignee cannot overwrite the new state; expected version conflict and reauthorization |
| Graph/Exchange tenant configuration | Export granted scopes and sender rights; confirm least privilege and no mistaken assumption that package removal revokes consent |
| Power Automate | Review trigger permissions, run-only users, connection owners, secrets, outputs/run-history visibility and ticket/AI data destinations |
| Azure production, if used | Verify TLS/proxy/rate limits, secret store/rotation, persistent protected audit storage, CSP, Entra app roles and Conditional Access |
| Uploaded files and retention | Verify real malware controls, safe handling, retention/recycle-bin permissions, and restore a sample ticket/comment/file |

## Reference basis

- [Microsoft: SPFx API permissions and shared tenant principal](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/use-aadhttpclient).
- [Microsoft: SharePoint permission levels](https://learn.microsoft.com/en-us/sharepoint/understanding-permission-levels).
- [Microsoft: SharePoint groups and permission inheritance](https://support.microsoft.com/en-us/sharepoint/admin/understand-groups-and-permissions-on-a-sharepoint-site).
- [Microsoft: selected-resource permissions and explicit resource assignments](https://learn.microsoft.com/en-us/graph/permissions-selected-overview).
- [Microsoft: Graph permission reference](https://learn.microsoft.com/en-us/graph/permissions-reference).
- [Microsoft: access tokens and API-side validation](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens).
- [Microsoft: SPA/MSAL application configuration](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-spa-app-configuration).

These sources support the platform interpretation. Repository findings are based on the referenced implementation and the local checks above; they do not establish your live tenant state.
