export const notificationEvents=['created','assigned','resolved','closed'] as const;
export type NotificationEvent=typeof notificationEvents[number];
export const eventNames:Record<NotificationEvent,string>={created:'Ticket Created',assigned:'Ticket Assigned',resolved:'Ticket Resolved',closed:'Ticket Closed'};
export const recipientNames={requester:'Requester',creator:'Created by',assignee:'Assigned agent',team:'Support team email',actor:'Person making the change'} as const;
export type RecipientRole=keyof typeof recipientNames;
export interface INotificationRule {email:boolean;inApp:boolean;subject:string;body:string;to:RecipientRole[];cc:RecipientRole[];extraTo:string[];extraCc:string[];}
export interface IEmailSettings {enabled:boolean;sender:'current'|'shared';sharedMailbox:string;replyTo:string;appUrl:string;rules:Record<NotificationEvent,INotificationRule>;}
export interface INotificationRecord {id:string;ticketId:number;event:NotificationEvent;subject:string;created:string;status:string;error:string;recipients:string[];inApp:boolean;}
export interface IChangeSnapshot {status:string;assignedToId:number;}
export interface INotificationService {
  canManage:boolean;
  getSettings():Promise<IEmailSettings>;
  saveSettings(value:IEmailSettings):Promise<void>;
  history():Promise<INotificationRecord[]>;
  inbox():Promise<INotificationRecord[]>;
  test(value:IEmailSettings,event:NotificationEvent):Promise<void>;
}
