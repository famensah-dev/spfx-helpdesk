import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createSharePointService } = require('../../../compiled/services/SharePointTicketService.js');
/** Existing list-backed implementation; all requests retain delegated SharePoint ACL enforcement. */
export function createSharePointProvider(context, config) {
    return createSharePointService(context, config.listName, undefined, { siteUrl: config.siteUrl, pageUrl: config.pageUrl }, true);
}
