import * as React from 'react';
import { Icon } from '@fluentui/react';
import type { ITicket } from '../interfaces/ITicket';
import type { ITicketComment, ITicketVersion } from '../interfaces/ITicketDataSource';
import styles from './HelpdeskSystem.module.scss';
export function TicketActivity(props:{ticket:ITicket;history:ITicketVersion[];comments:ITicketComment[]}):React.ReactElement {
  const events=React.useMemo(()=>{
    const rows=props.history.map(version=>({id:'version:'+version.id,at:version.modified,author:version.author,action:new Date(version.modified).getTime()===new Date(props.ticket.Created).getTime() ? 'created the ticket' : 'updated ticket details',icon:new Date(version.modified).getTime()===new Date(props.ticket.Created).getTime() ? 'Add' : 'Edit',detail:''}));
    if(!rows.some(row=>row.action==='created the ticket'))rows.push({id:'created',at:props.ticket.Created,author:props.ticket.CreatedBy?.Title || props.ticket.CreatedBy?.Email || 'Unknown author',action:'created the ticket',icon:'Add',detail:''});
    for(const comment of props.comments){rows.push({id:'comment:'+comment.id,at:comment.created,author:comment.author,action:'commented',icon:'Comment',detail:comment.text.length>180 ? comment.text.slice(0,180)+'...' : comment.text});for(const file of comment.attachments || [])rows.push({id:'attachment:'+comment.id+':'+file.url,at:file.created || comment.created,author:file.author || comment.author,action:'added an attachment',icon:'Attach',detail:file.name});}
    return rows.filter(row=>Number.isFinite(new Date(row.at).getTime())).sort((a,b)=>new Date(b.at).getTime()-new Date(a.at).getTime());
  },[props.history,props.comments,props.ticket]);
  const groups:Array<{key:string;date:string;rows:typeof events}>=[];
  for(const event of events){const date=new Date(event.at);const key=date.toLocaleDateString('en-CA');let group=groups[groups.length-1];if(!group || group.key!==key){group={key,date:date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),rows:[]};groups.push(group);}group.rows.push(event);}
  return <div className={styles.activityTimeline}>{groups.map(group=><section key={group.key}><h4>{group.date}</h4><ol>{group.rows.map(event=><li key={event.id}><span className={styles.activityTimelineIcon} aria-hidden="true"><Icon iconName={event.icon} /></span><div className={styles.activityTimelineBody}><p><strong>{event.author}</strong> {event.action}</p>{event.detail && <div>{event.detail}</div>}</div><time dateTime={event.at}>{new Date(event.at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true})}</time></li>)}</ol></section>)}</div>;
}
