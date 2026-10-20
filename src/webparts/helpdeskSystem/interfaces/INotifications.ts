export const notificationEvents = ['created','assigned','escalated','resolved','closed','comment'] as const;
export type NotificationEvent = typeof notificationEvents[number];
export interface INotificationRule { event:NotificationEvent; enabled:boolean; requester:boolean; assignee:boolean; helpdesk:boolean; subject:string; body:string; }
export interface INotificationSettings { version:1; enabled:boolean; mailbox:string; helpdeskEmails:string; appUrl:string; flowUrl:string; rules:INotificationRule[]; }
export interface INotificationLogEntry {Id:number;TicketId:number;Event:string;Recipients:string;DeliveryStatus:string;Created:string;SentAt?:string;LastError?:string;}
export interface INotificationManagement { load():Promise<INotificationSettings>; save(value:INotificationSettings):Promise<void>; log?():Promise<INotificationLogEntry[]>; }
export const notificationLabels:Record<NotificationEvent,string> = {created:'Ticket Created',assigned:'Ticket Assigned',escalated:'Ticket Escalated',resolved:'Ticket Resolved / Completed',closed:'Ticket Closed',comment:'Comment Response'};
export function defaultNotificationSettings(appUrl = ''):INotificationSettings {
  return {version:1,enabled:false,mailbox:'',helpdeskEmails:'',appUrl,flowUrl:'',rules:notificationEvents.map(event => ({event,enabled:true,requester:['created','resolved','closed','comment'].includes(event),assignee:['assigned','escalated'].includes(event),helpdesk:['created','escalated'].includes(event),subject:`[DeskPilot #{{ticketId}}] ${notificationLabels[event]}: {{title}}`,body:event === 'comment' ? '{{comment}}\n\nView ticket: {{ticketUrl}}' : '{{title}}\nStatus: {{status}}\nAssigned to: {{assignee}}\n\n{{resolution}}\n\nView ticket: {{ticketUrl}}'}))};
}
export const notificationTokens = ['ticketId','title','status','priority','assignee','requester','resolution','comment','ticketUrl'] as const;
export function emailAddresses(value:string):string[] {return [...new Set(value.split(/[;,\n]/).map(item => item.trim().toLowerCase()).filter(Boolean))];}
export function validateNotificationSettings(value:INotificationSettings):void {
  if (!value || value.version !== 1 || typeof value.enabled !== 'boolean' || !Array.isArray(value.rules) || value.rules.length !== notificationEvents.length) throw new Error('Invalid notification settings.');
  for (const key of ['mailbox','helpdeskEmails','appUrl','flowUrl'] as const) if (typeof value[key] !== 'string') throw new Error('Invalid email configuration.');
  const validEmail = (email:string):boolean => /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(email);
  if ((value.mailbox && !validEmail(value.mailbox)) || emailAddresses(value.helpdeskEmails).some(email => !validEmail(email))) throw new Error('Enter valid mailbox and helpdesk email addresses.');
  if (emailAddresses(value.helpdeskEmails).length > 20) throw new Error('Use up to 20 helpdesk recipients.');
  for (const key of ['appUrl','flowUrl'] as const) if (value[key]) {
    let url:URL; try {url = new URL(value[key]);} catch {throw new Error('Enter a valid HTTPS URL.');}
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Use an HTTPS URL without credentials or a fragment.');
    if (key === 'flowUrl' && (url.hostname !== 'make.powerautomate.com' || url.search)) throw new Error('Use a flow management link from make.powerautomate.com, not a trigger URL.');
    if (key === 'appUrl' && (url.searchParams.has('debugManifestsFile') || url.searchParams.has('debug'))) throw new Error('Use the production DeskPilot URL without debug parameters.');
  }
  const seen = new Set<string>();
  for (const rule of value.rules) {
    if (!rule || !notificationEvents.includes(rule.event) || seen.has(rule.event)) throw new Error('Each notification event must appear once.'); seen.add(rule.event);
    for (const key of ['enabled','requester','assignee','helpdesk'] as const) if (typeof rule[key] !== 'boolean') throw new Error('Invalid notification recipients.');
    if (typeof rule.subject !== 'string' || !rule.subject.trim() || rule.subject.length > 255 || /[\r\n]/.test(rule.subject) || typeof rule.body !== 'string' || !rule.body.trim() || rule.body.length > 8000) throw new Error('Enter a subject up to 255 characters and a message up to 8,000 characters.');
    for (const match of (rule.subject+' '+rule.body).matchAll(/{{([^{}]+)}}/g)) if (!(notificationTokens as readonly string[]).includes(match[1])) throw new Error(`Unknown template field: ${match[1]}`);
    if (value.enabled && rule.enabled && !rule.requester && !rule.assignee && !rule.helpdesk) throw new Error(`${notificationLabels[rule.event]} needs at least one recipient.`);
    if (value.enabled && rule.enabled && rule.helpdesk && !emailAddresses(value.helpdeskEmails).length) throw new Error('Add helpdesk recipients for the enabled rules.');
  }
  if (value.enabled && (!value.mailbox || !value.appUrl || !value.flowUrl)) throw new Error('Add the sender mailbox, DeskPilot page URL and notification flow link before enabling email delivery.');
  if (JSON.stringify(value).length > 30000) throw new Error('Notification settings are too large. Shorten the email templates.');
}
