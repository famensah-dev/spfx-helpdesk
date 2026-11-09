import type { GraphClient } from './GraphClient';
import type { IAppConfig } from './IAppConfig';
import type { ITicket } from '../../interfaces/ITicket';
import { notificationEvents, eventNames } from '../../interfaces/INotifications';
import type { IEmailSettings, INotificationRecord, INotificationRule, IChangeSnapshot, NotificationEvent, RecipientRole } from '../../interfaces/INotifications';
import { defaultEmailSettings, validateEmailSettings, renderEmail, ticketEmailValues, invitationEmailValues, isEmail } from '../../utils/emailTemplates';
import type { IRoleAssignment } from '../../interfaces/IRoleManagement';
import { workspaceLists } from '../../interfaces/IWorkspaceSetup';
interface Item {id:string;eTag?:string;'@odata.etag'?:string;createdDateTime?:string;fields:Record<string,unknown>;}
export class GraphNotificationService {
  private cache?:{expires:number;value:IEmailSettings};
  private paths?:{settings:string;log:string};
  public constructor(private graph:GraphClient,private config:IAppConfig,private actor:{email:string;name:string},private canManage:boolean,private appUrl:string,private workspace:string,private visibleTickets:()=>Promise<ITicket[]>,private teamEmail:(id:number)=>Promise<string>){}
  private async context(optional=false):Promise<{settings:string;log:string}|undefined>{
    if(this.paths)return this.paths;
    const url=new URL(this.config.siteUrl);
    const site=this.config.siteId ? {id:this.config.siteId} : await this.graph.get<{id:string}>(`/sites/${url.hostname}:${url.pathname}?$select=id`);
    const path=`/sites/${encodeURIComponent(site.id)}/lists`;
    const lists=await this.graph.getAll<{id:string;displayName:string}>(path+'?$select=id,displayName');
    const find=(key:'emailSettings'|'notificationLog'):string|undefined=>lists.find(list=>this.config.resourceIds?.[key] ? list.id.toLowerCase()===this.config.resourceIds[key].toLowerCase() : list.displayName===workspaceLists[key])?.id;
    const settings=find('emailSettings'),log=find('notificationLog');
    if(!settings||!log){if(optional)return undefined;throw new Error('Run Initialize workspace to add email settings and notification history, then reload DeskPilot.');}
    this.paths={settings:path+'/'+encodeURIComponent(settings),log:path+'/'+encodeURIComponent(log)};return this.paths;
  }
  private requireAdmin():void {if(!this.canManage)throw new Error('Only Helpdesk Admins can configure or test email notifications.');}
  private async settingItems(path:string):Promise<Item[]>{return this.graph.getAll<Item>(path+"/items?$expand=fields&$filter=fields/SettingKey eq 'Configuration'&$top=2");}
  public async getSettings(optional=false):Promise<IEmailSettings>{
    if(optional && this.cache && this.cache.expires>Date.now())return this.cache.value;
    const context=await this.context(optional);
    if(!context){const value=defaultEmailSettings(this.appUrl);this.cache={expires:Date.now()+30000,value};return value;}
    const items=await this.settingItems(context.settings);
    if(items.length>1)throw new Error('Duplicate email settings found. Ask a Super Admin to correct the configuration.');
    const value=items.length ? JSON.parse(String(items[0].fields.Configuration || '{}')) as IEmailSettings : defaultEmailSettings(this.appUrl);
    if (/\/_layouts\/15\/(?:teams|teamstask)hostedapp\.aspx/i.test(value.appUrl || '') && /\/(?:SitePages|Pages)\//i.test(this.appUrl)) value.appUrl=this.appUrl;
    value.autoInvite=value.autoInvite??false;
    value.rules.invited=value.rules.invited||defaultEmailSettings(this.appUrl).rules.invited;
    value.rules.slaBreached=value.rules.slaBreached||defaultEmailSettings(this.appUrl).rules.slaBreached;
    validateEmailSettings(value);this.cache={expires:Date.now()+30000,value};return value;
  }
  public async enabled():Promise<boolean>{return (await this.getSettings(true)).enabled;}
  public async saveSettings(value:IEmailSettings):Promise<void>{
    this.requireAdmin();validateEmailSettings(value);const context=(await this.context())!;
    const items=await this.settingItems(context.settings);
    if(items.length>1)throw new Error('Duplicate email settings found.');
    const fields={Title:'Email notifications',SettingKey:'Configuration',Configuration:JSON.stringify(value)};
    if(items[0]){const item=await this.graph.get<Item>(context.settings+'/items/'+items[0].id+'?$expand=fields');const etag=item.eTag || item['@odata.etag'];if(!etag)throw new Error('Refresh email settings before saving.');await this.graph.patch(context.settings+'/items/'+item.id+'/fields',fields,etag);}
    else await this.graph.post(context.settings+'/items',{fields});
    this.cache=undefined;
  }
  private record(item:Item):INotificationRecord {
    let recipients:string[]=[];try{recipients=JSON.parse(String(item.fields.Audience || '[]')) as string[];}catch{/* A malformed log must not break the notification panel. */}
    return {id:item.id,ticketId:Number(item.fields.TicketId),event:item.fields.Event as NotificationEvent,subject:String(item.fields.Subject || ''),created:item.createdDateTime || '',status:String(item.fields.DeliveryStatus || ''),error:String(item.fields.Error || ''),recipients:Array.isArray(recipients)?recipients.filter(value=>typeof value==='string'):[],inApp:item.fields.InApp===true};
  }
  private async latest():Promise<INotificationRecord[]>{
    const context=await this.context(true);if(!context)return [];
    const result=await this.graph.get<{value:Item[]}>(context.log+'/items?$expand=fields&$orderby=createdDateTime desc&$top=100');return result.value.map(item=>this.record(item));
  }
  public async history():Promise<INotificationRecord[]>{this.requireAdmin();return this.latest();}
  public async inbox():Promise<INotificationRecord[]>{
    const [items,tickets]=await Promise.all([this.latest(),this.visibleTickets()]);const ids=new Set(tickets.map(ticket=>ticket.Id));
    return items.filter(item=>item.inApp&&ids.has(item.ticketId)&&item.recipients.some(email=>email.toLowerCase()===this.actor.email.toLowerCase()));
  }
  private addresses(rule:INotificationRule,ticket:ITicket,teamEmail:string):{to:string[];cc:string[]}{
    const roles:Record<RecipientRole,string|undefined>={requester:ticket.RequesterEmail || ticket.Requester?.Email,creator:ticket.CreatedBy?.Email,assignee:ticket.AssignedTo?.Email,team:teamEmail,actor:this.actor.email};
    const clean=(values:Array<string|undefined>):string[]=>[...new Set(values.filter((value):value is string=>Boolean(value)).map(value=>value!.trim().toLowerCase()).filter(isEmail))];
    const to=clean([...rule.to.map(role=>roles[role]),...rule.extraTo]);const cc=clean([...rule.cc.map(role=>roles[role]),...rule.extraCc]).filter(address=>!to.includes(address));return {to,cc};
  }
  private async send(settings:IEmailSettings,subject:string,html:string,to:string[],cc:string[]):Promise<void>{
    const recipient=(address:string):{emailAddress:{address:string}}=>({emailAddress:{address}});
    await this.graph.post('/me/sendMail',{message:{subject,body:{contentType:'HTML',content:html},toRecipients:to.map(recipient),ccRecipients:cc.map(recipient),...(settings.sender==='shared'?{from:recipient(settings.sharedMailbox.trim())}:{}),...(settings.replyTo?{replyTo:[recipient(settings.replyTo.trim())]}:{})},saveToSentItems:true});
  }
  public async test(settings:IEmailSettings,event:NotificationEvent):Promise<void>{
    this.requireAdmin();validateEmailSettings(settings);if(!isEmail(this.actor.email))throw new Error('Your email address is unavailable.');
    const ticket:ITicket={Id:123,Title:'Example support request',Status:event==='closed'?'Closed':event==='resolved'?'Resolved':'New',Priority:'Medium',Created:new Date().toISOString(),Modified:new Date().toISOString(),Requester:{Title:'Example requester',Email:this.actor.email},RequesterEmail:this.actor.email,AssignedTo:{Id:1,Title:'Example agent',Email:this.actor.email},AssignedUnit:'Example team',ResolutionSummary:'The issue has been fixed.'};
    const rendered=renderEmail(settings.rules[event],event==='invited'?invitationEmailValues({name:'Example user',email:this.actor.email},'Agent',settings.appUrl,this.workspace,this.actor.name):ticketEmailValues(ticket,settings.appUrl,this.workspace,this.actor.name,event,'team@example.com'));
    await this.send(settings,'[TEST] '+rendered.subject,rendered.html,[this.actor.email],[]);
  }
  public async invite(user:IRoleAssignment,roleName:string,automatic=false):Promise<boolean>{
    this.requireAdmin();
    if(user.disabled || !Number.isSafeInteger(user.userId) || user.userId<=0 || !isEmail(user.email))throw new Error('An active user with a valid email address is required.');
    const settings=await this.getSettings();
    if(automatic&&!settings.autoInvite)return false;
    if(!settings.rules.invited.email){if(automatic)return false;throw new Error('Enable User Invitation email in Email Settings first.');}
    const context=(await this.context())!;
    const key='invite:'+user.userId+':'+(automatic?'added:'+user.addedAt:Date.now()+':'+Math.random().toString(36).slice(2));
    const filter=encodeURIComponent("fields/NotificationKey eq '"+key.replace(/'/g,"''")+"'");
    if(automatic&&(await this.graph.getAll<Item>(context.log+'/items?$expand=fields&$filter='+filter+'&$top=1')).length)return false;
    const rendered=renderEmail(settings.rules.invited,invitationEmailValues(user,roleName,settings.appUrl,this.workspace,this.actor.name));
    // Log before submission; an uncertain claim or mail response must never trigger an automatic resend.
    const claim=await this.graph.post<Item>(context.log+'/items',{fields:{Title:eventNames.invited,NotificationKey:key,TicketId:0,Event:'invited',Subject:rendered.subject,Audience:JSON.stringify([user.email]),InApp:false,DeliveryStatus:'Pending',Error:''}});
    let error='';
    try{await this.send(settings,rendered.subject,rendered.html,[user.email],[]);}catch(reason){error=reason instanceof Error?reason.message:'Email submission could not be confirmed.';}
    try{await this.graph.patch(context.log+'/items/'+claim.id+'/fields',{DeliveryStatus:error?'Failed or unconfirmed':'Accepted',Error:error});}catch{throw new Error('Invitation status could not be saved. Check email history and Exchange before sending again.');}
    if(error)throw new Error(error+' Check email history before sending again.');
    return true;
  }
  public async slaBreach(ticket:ITicket,kind:'response'|'resolution',email:string):Promise<void>{
    const settings=await this.getSettings(true);if(!settings.enabled)return;
    const rule=settings.rules.slaBreached;if(!rule.email&&!rule.inApp)return;
    if(!isEmail(email))throw new Error('SLA breach: configure a team lead with a valid email address.');
    const context=(await this.context())!,key=`${ticket.Id}:slaBreached:${kind}:${ticket.Created}`;
    const filter=encodeURIComponent("fields/NotificationKey eq '"+key.replace(/'/g,"''")+"'");
    if((await this.graph.getAll<Item>(context.log+'/items?$expand=fields&$filter='+filter+'&$top=1')).length)return;
    const rendered=renderEmail(rule,ticketEmailValues(ticket,settings.appUrl,this.workspace,this.actor.name,'slaBreached'));
    let claim:Item;
    try{claim=await this.graph.post<Item>(context.log+'/items',{fields:{Title:'SLA Breach',NotificationKey:key,TicketId:ticket.Id,Event:'slaBreached',Subject:rendered.subject,Audience:JSON.stringify([email]),InApp:rule.inApp,DeliveryStatus:rule.email?'Pending':'In-app only',Error:''}});}catch(reason){if((await this.graph.getAll<Item>(context.log+'/items?$expand=fields&$filter='+filter+'&$top=1')).length)return;throw reason;}
    if(!rule.email)return;
    try{await this.send(settings,rendered.subject,rendered.html,[email],[]);await this.graph.patch(context.log+'/items/'+claim.id+'/fields',{DeliveryStatus:'Accepted',Error:''});}
    catch(reason){await this.graph.patch(context.log+'/items/'+claim.id+'/fields',{DeliveryStatus:'Failed or unconfirmed',Error:reason instanceof Error?reason.message:'Email submission failed.'});throw reason;}
  }
  public async changed(ticket:ITicket,before?:IChangeSnapshot,created=false,resolutionEmail?:boolean):Promise<void>{
    const settings=await this.getSettings(true);if(!settings.enabled && resolutionEmail!==true)return;
    const events:NotificationEvent[]=[];
    if(created)events.push('created');
    if(ticket.AssignedTo?.Id && (created || (before && before.assignedToId!==ticket.AssignedTo.Id)))events.push('assigned');
    const normalize=(status:string):string=>status==='Completed'?'Resolved':status;
    if(before && normalize(ticket.Status)!==normalize(before.status)){
      if(normalize(ticket.Status)==='Resolved')events.push('resolved');
      if(ticket.Status==='Closed')events.push('closed');
    }
    const context=(await this.context())!;const errors:string[]=[];
    const needsTeam=events.some(event=>[...settings.rules[event].to,...settings.rules[event].cc].includes('team') || settings.rules[event].body.includes('{{TeamEmail}}'));
    const teamEmail=needsTeam && ticket.AssignedUnitId ? await this.teamEmail(ticket.AssignedUnitId) : '';
    for(const event of notificationEvents.filter(value=>events.includes(value))){
      if(!settings.enabled && event!=='resolved')continue;
      const configured=settings.rules[event];
      const rule=event==='resolved' && resolutionEmail!==undefined ? {...configured,email:resolutionEmail,inApp:settings.enabled && configured.inApp,...(resolutionEmail ? {to:['requester' as const],cc:[],extraTo:[],extraCc:[]} : {})} : configured;
      if(!rule.email&&!rule.inApp)continue;
      const revision=event==='created' ? 'initial' : ticket.ChangeVersion || ticket.Modified;
      if(!revision)throw new Error('Notification version could not be verified. Ticket saved; email was not sent.');
      const key=ticket.Id+':'+event+':'+revision;
      const filter=encodeURIComponent("fields/NotificationKey eq '"+key.replace(/'/g,"''")+"'");
      const existing=await this.graph.getAll<Item>(context.log+'/items?$expand=fields&$filter='+filter+'&$top=1');if(existing.length)continue;
      const {to,cc}=this.addresses(rule,ticket,teamEmail);
      const rendered=renderEmail(rule,ticketEmailValues(ticket,settings.appUrl,this.workspace,this.actor.name,event,teamEmail));
      let claim:Item;
      try{claim=await this.graph.post<Item>(context.log+'/items',{fields:{Title:eventNames[event],NotificationKey:key,TicketId:ticket.Id,Event:event,Subject:rendered.subject,Audience:JSON.stringify([...to,...cc]),InApp:rule.inApp,DeliveryStatus:rule.email?'Pending':'In-app only',Error:''}});}
      catch(reason){if((await this.graph.getAll<Item>(context.log+'/items?$expand=fields&$filter='+filter+'&$top=1')).length)continue;throw reason;}
      if(!rule.email)continue;
      let status='Accepted',error='';
      if(!to.length){status='Skipped';error='No valid To recipients could be resolved.';}
      else try{await this.send(settings,rendered.subject,rendered.html,to,cc);}catch(reason){status='Failed or unconfirmed';error=reason instanceof Error ? reason.message : 'Email submission failed. No automatic retry.';}
      try{await this.graph.patch(context.log+'/items/'+claim.id+'/fields',{DeliveryStatus:status,Error:error});}catch{errors.push('Notification status could not be saved; check Exchange before sending again.');}
      if(error)errors.push(eventNames[event]+': '+error);
    }
    if(errors.length)throw new Error(errors.join(' '));
  }
}
