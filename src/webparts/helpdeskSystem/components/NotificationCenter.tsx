import * as React from 'react';
import { DefaultButton, Icon, IconButton, MessageBar, MessageBarType, Panel, PanelType } from '@fluentui/react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import type { INotificationRecord } from '../interfaces/INotifications';
import { cancelButtonStyles } from './cancelButtonStyles';
import styles from './HelpdeskSystem.module.scss';
export function NotificationCenter({service,onOpenTicket}:{service:ITicketDataSource;onOpenTicket:(id:number)=>void}):React.ReactElement|null {
  const [open,setOpen]=React.useState(false),[loading,setLoading]=React.useState(false);
  const [items,setItems]=React.useState<INotificationRecord[]>([]),[error,setError]=React.useState('');
  const key='deskpilot-notifications:'+service.access?.siteUrl+':'+service.access?.email;
  const [seen,setSeen]=React.useState<string[]>(()=>{try{const value:unknown=JSON.parse(localStorage.getItem(key) || '[]');return Array.isArray(value)?value.filter(item=>typeof item==='string'):[];}catch{return [];}});
  const generation=React.useRef(0);
  const load=React.useCallback(async():Promise<void>=>{if(!service.notifications)return;const current=++generation.current;setLoading(true);try{const result=await service.notifications.inbox();if(generation.current===current){setItems(result);setError('');}}catch(reason){if(generation.current===current)setError(reason instanceof Error ? reason.message : 'Unable to load notifications.');}finally{if(generation.current===current)setLoading(false);}},[service]);
  React.useEffect(()=>{void load();const timer=window.setInterval(()=>{if(!document.hidden)void load();},60000);return()=>{generation.current++;window.clearInterval(timer);};},[load]);
  if(!service.notifications)return null;
  const unread=items.filter(item=>!seen.includes(item.id)).length;
  const markRead=(ids:string[]=items.map(item=>item.id)):void=>{const next=[...new Set([...seen,...ids])].slice(-500);setSeen(next);try{localStorage.setItem(key,JSON.stringify(next));}catch{/* Reading notifications still works if browser storage is disabled. */}};
  return <><span style={{position:'relative',display:'inline-flex'}}><IconButton iconProps={{iconName:'Ringer'}} styles={{root:{background:'transparent',color:'#fff'},rootHovered:{background:'#ffffff12',color:'#fff'}}} ariaLabel={'Notifications'+(unread?' ('+unread+' unread)':'')} title={'Notifications'+(unread?' ('+unread+' unread)':'')} onClick={()=>{setOpen(true);void load();}} />{unread>0&&<span aria-hidden="true" style={{position:'absolute',top:-2,right:-5,minWidth:17,height:17,padding:'0 4px',boxSizing:'border-box',borderRadius:10,background:'#d13438',color:'#fff',fontSize:10,fontWeight:600,lineHeight:'17px',textAlign:'center',pointerEvents:'none'}}>{unread>99?'99+':unread}</span>}</span><Panel isOpen={open} type={PanelType.custom} customWidth="440px" headerText="Notifications" className={styles.notificationPanel} closeButtonAriaLabel="Close notifications" isLightDismiss onDismiss={()=>setOpen(false)} onRenderNavigation={()=>null} onRenderHeader={(_props,_render,headerId?:string)=><div className="notification-heading"><h2 id={headerId}>Notifications</h2><IconButton iconProps={{iconName:'Cancel'}} ariaLabel="Close notifications" title="Close notifications" styles={{root:{width:28,height:28,minWidth:28,padding:0,border:0,background:'transparent',color:'#526783'},rootHovered:{background:'transparent',color:'#172536'},icon:{fontSize:14}}} onClick={()=>setOpen(false)} /></div>} styles={{main:{maxWidth:'100vw',background:'#fff'},commands:{display:'none'},content:{padding:'0 20px 20px'}}}>
    <p className="notification-intro">Stay updated on your tickets and activities.</p>
    <div className="notification-actions"><DefaultButton text="Mark All as Read" iconProps={{iconName:'Mail'}} styles={{...cancelButtonStyles,root:[cancelButtonStyles.root,{minWidth:0,padding:0}],label:[cancelButtonStyles.label,{margin:0}],icon:{marginLeft:0,marginRight:8}}} onClick={()=>markRead()} disabled={!unread} /><IconButton ariaLabel={loading?'Refreshing notifications':'Refresh notifications'} title="Refresh notifications" className={loading?'notification-refresh-loading':undefined} iconProps={{iconName:'Refresh'}} styles={{root:{height:26,width:26,minWidth:26,padding:0,border:0,background:'transparent',color:'#172536'},rootHovered:{background:'transparent',color:'#172536'},rootPressed:{background:'transparent',color:'#172536'},icon:{fontSize:13}}} disabled={loading} onClick={()=>{void load();}} /></div>
    {error&&<MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {items.map(item=>{
      const isUnread=!seen.includes(item.id);
      const event={created:{name:'Ticket Created',icon:'PageAdd'},assigned:{name:'Ticket Assigned',icon:'AddFriend'},resolved:{name:'Ticket Resolved',icon:'CheckMark'},closed:{name:'Ticket Closed',icon:'Lock'},invited:{name:'User Invitation',icon:'Mail'}}[item.event];
      const heading=event?'[DeskPilot #'+item.ticketId+'] '+event.name:item.subject;
      const prefix=event?heading+': ':'';
      const detail=prefix&&item.subject.startsWith(prefix)?item.subject.slice(prefix.length):event&&item.subject!==heading?item.subject:'';
      return <button type="button" key={item.id} className="notification-item" data-unread={isUnread} onClick={()=>{markRead([item.id]);setOpen(false);onOpenTicket(item.ticketId);}}>
        <span className="notification-event-icon" data-event={item.event} aria-hidden="true"><Icon iconName={event?.icon || 'Ringer'} /></span>
        <span className="notification-copy"><span className="notification-subject">{heading}</span>{detail&&<span className="notification-detail">{detail}</span>}<time dateTime={item.created}><Icon iconName="Clock" />{new Date(item.created).toLocaleString(undefined,{year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'})}</time></span>
        {isUnread&&<span className="notification-unread-dot" aria-label="Unread" />}
      </button>;
    })}
    {!loading&&!error&&!items.length&&<p>No notifications yet.</p>}
  </Panel></>;
}
