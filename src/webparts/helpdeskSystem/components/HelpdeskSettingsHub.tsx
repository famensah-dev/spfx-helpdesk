import * as React from 'react';
import { Icon, SearchBox } from '@fluentui/react';
import styles from './HelpdeskSystem.module.scss';
export interface IHelpdeskSettingLink {key:string;title:string;description:string;icon:string;group:string;}
export function HelpdeskSettingsHub({links,onOpen}:{links:IHelpdeskSettingLink[];onOpen:(key:string)=>void}):React.ReactElement {
  const [query,setQuery]=React.useState('');
  const visible=links.filter(link=>`${link.title} ${link.description} ${link.group}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className={styles.helpdeskSettingsHub}>
    <div className={styles.helpdeskSettingsHeading}><div><h2>Helpdesk settings</h2><p>Manage your support teams, ticket setup and day-to-day helpdesk operations.</p></div><SearchBox ariaLabel="Search helpdesk settings" placeholder="Find a setting" value={query} onChange={(_,value)=>setQuery(value || '')} /></div>
    <div className={styles.helpdeskSettingsGroups}>{['People & Teams','Ticket Configuration','Automation','Knowledge Base','Advanced'].map(group=>{
      const items=visible.filter(link=>link.group===group);
      return items.length ? <section key={group}><h3>{group}</h3>{items.map(link=><button type="button" key={link.key} onClick={()=>onOpen(link.key)}><Icon iconName={link.icon} /><span><strong>{link.title}</strong><small>{link.description}</small></span><Icon iconName="ChevronRight" /></button>)}</section> : null;
    })}</div>
    {!visible.length && <p>No settings match your search.</p>}
  </div>;
}
