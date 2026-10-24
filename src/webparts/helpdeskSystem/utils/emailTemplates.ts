import { notificationEvents, eventNames, recipientNames } from '../interfaces/INotifications';
import type { IEmailSettings, INotificationRule, NotificationEvent } from '../interfaces/INotifications';
import type { ITicket } from '../interfaces/ITicket';
import { safeDescriptionHtml } from '../components/RichTextEditor';
import { ticketLink } from './appRoutes';
export const emailTokens=['TicketId','TicketTitle','Description','Status','Priority','Category','RequesterName','RequesterEmail','CreatorName','AssignedTo','AssignedToEmail','Team','TeamEmail','ResolutionSummary','TicketLink','WorkspaceName','ChangedBy','Event'] as const;
export const isEmail=(value:string):boolean=>value.length<=254 && /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(value);
export function defaultEmailSettings(appUrl:string):IEmailSettings {
  const rules={} as IEmailSettings['rules'];
  for(const event of notificationEvents)rules[event]={email:true,inApp:true,to:[event==='assigned'?'assignee':'requester'],cc:[],extraTo:[],extraCc:[],subject:'[DeskPilot #{{TicketId}}] '+eventNames[event]+': {{TicketTitle}}',body:'<p>Hello {{RequesterName}},</p><p>'+eventNames[event]+': <strong>{{TicketTitle}}</strong>.</p><p>Status: {{Status}}<br>Priority: {{Priority}}<br>Assigned to: {{AssignedTo}}</p>'+(event==='resolved'||event==='closed'?'<p>{{ResolutionSummary}}</p>':'')+'<p>{{TicketLink}}</p><p>{{WorkspaceName}}</p>'};
  return {enabled:false,sender:'current',sharedMailbox:'',replyTo:'',appUrl,rules};
}
export function validateEmailSettings(value:IEmailSettings):void {
  if(!value || typeof value.enabled!=='boolean' || !['current','shared'].includes(value.sender))throw new Error('Choose a valid sender and notification setting.');
  if(value.sender==='shared' && !isEmail(value.sharedMailbox.trim()))throw new Error('Enter a valid shared mailbox address.');
  if(value.replyTo && !isEmail(value.replyTo.trim()))throw new Error('Enter a valid Reply-to address.');
  const url=new URL(value.appUrl);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('Enter the full DeskPilot page URL.');
  for(const event of notificationEvents){
    const rule=value.rules?.[event];
    if(!rule || typeof rule.email!=='boolean' || typeof rule.inApp!=='boolean' || typeof rule.subject!=='string' || !rule.subject.trim() || rule.subject.length>255 || typeof rule.body!=='string' || !rule.body.trim() || rule.body.length>12000)throw new Error(eventNames[event]+': enter a subject and message (maximum 255 and 12,000 characters).');
    for(const list of [rule.to,rule.cc])if(!Array.isArray(list)||list.some(role=>!Object.prototype.hasOwnProperty.call(recipientNames,role)))throw new Error('Choose valid recipient roles.');
    for(const list of [rule.extraTo,rule.extraCc])if(!Array.isArray(list)||list.length>50||list.some(address=>typeof address!=='string'||!isEmail(address.trim())))throw new Error('Enter valid additional recipient addresses (maximum 50 per field).');
    if((rule.email||rule.inApp)&&!rule.to.length&&!rule.extraTo.length)throw new Error(eventNames[event]+': choose at least one To recipient.');
    for(const token of (rule.subject+' '+rule.body).matchAll(/{{([^{}]+)}}/g))if(!(emailTokens as readonly string[]).includes(token[1]))throw new Error('Unknown email placeholder: '+token[0]);
  }
  if(JSON.stringify(value).length>60000)throw new Error('Email settings are too large. Shorten the templates.');
}
const plain=(value?:string):string=>new DOMParser().parseFromString(value || '', 'text/html').body.textContent || '';
export function ticketEmailValues(ticket:ITicket,appUrl:string,workspace:string,actor:string,event:NotificationEvent,teamEmail=''):Record<string,string> {
  return {TicketId:String(ticket.Id),TicketTitle:ticket.Title,Description:plain(ticket.Description),Status:ticket.Status==='Completed'?'Resolved':ticket.Status,Priority:ticket.Priority,Category:ticket.Category || '',RequesterName:ticket.Requester?.Title || ticket.RequesterEmail || '',RequesterEmail:ticket.RequesterEmail || ticket.Requester?.Email || '',CreatorName:ticket.CreatedBy?.Title || '',AssignedTo:ticket.AssignedTo?.Title || 'Unassigned',AssignedToEmail:ticket.AssignedTo?.Email || '',Team:ticket.AssignedUnit || '',TeamEmail:teamEmail,ResolutionSummary:ticket.SolutionCommentId ? ticket.ResolutionSummary || '' : plain(ticket.ResolutionSummary),TicketLink:ticketLink(appUrl,ticket.Id),WorkspaceName:workspace || 'DeskPilot',ChangedBy:actor,Event:eventNames[event]};
}
/** Tokens are inserted as text nodes; ticket text can never become executable HTML. */
export function renderEmail(rule:Pick<INotificationRule,'subject'|'body'>,values:Record<string,string>):{subject:string;html:string} {
  const replace=(value:string):string=>value.replace(/{{(\w+)}}/g,(_,key:string)=>values[key] || '');
  const doc=new DOMParser().parseFromString(rule.body,'text/html');
  const walk=(node:Node):void=>{
    for(const child of Array.from(node.childNodes)){
      if(child.nodeType===3){
        const fragments=(child.textContent || '').split(/({{\w+}})/g);
        const replacement=doc.createDocumentFragment();
        for(const part of fragments){
          if(part==='{{TicketLink}}' && /^https?:\/\//i.test(values.TicketLink || '')){const a=doc.createElement('a');a.href=values.TicketLink;a.textContent='Open ticket #'+values.TicketId;replacement.appendChild(a);}
          else replacement.appendChild(doc.createTextNode(replace(part)));
        }
        child.parentNode?.replaceChild(replacement,child);
      }else if(child.nodeType===1){const element=child as HTMLElement;if(element.tagName==='A'){const href=element.getAttribute('href');if(href)element.setAttribute('href',replace(href));}walk(element);}
    }
  };
  walk(doc.body);
  return {subject:replace(rule.subject).replace(/[\r\n]/g,' ').slice(0,998),html:safeDescriptionHtml(doc.body.innerHTML)};
}
