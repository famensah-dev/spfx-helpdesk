import * as React from 'react';
import { Icon, SearchBox } from '@fluentui/react';
import styles from './HelpdeskSystem.module.scss';
export interface IHelpdeskSettingLink {key:string;title:string;description:string;icon:string;group:string;}
export function HelpdeskSettingsHub({links,onOpen}:{links:IHelpdeskSettingLink[];onOpen:(key:string)=>void}):React.ReactElement {
  const [query,setQuery]=React.useState('');
  const visible=links.filter(link=>`${link.title} ${link.description} ${link.group}`.toLowerCase().includes(query.trim().toLowerCase()));
  const groups=[{key:'People & Teams',title:'People & Access',icon:'People',tone:'blue'},{key:'Ticket Configuration',title:'Ticket Configuration',icon:'Settings',tone:'green'},{key:'Automation',title:'Automation',icon:'LightningBolt',tone:'amber'},{key:'Knowledge Base',title:'Knowledge Base',icon:'ReadingMode',tone:'purple'},{key:'Advanced',title:'Advanced Settings',icon:'Settings',tone:'slate'}];
  const tones:Record<string,string>={units:'blue',members:'purple',usersRoles:'purple',categories:'green',subcategories:'cyan',issueTypes:'cyan',sla:'amber',assignment:'amber',faqs:'purple',schema:'slate'};
  return <div className={styles.helpdeskSettingsHub}>
    <div className={styles.helpdeskSettingsHeading}><div><h2>Helpdesk Settings</h2></div><SearchBox ariaLabel="Search helpdesk settings" placeholder="Find a setting" value={query} onChange={(_,value)=>setQuery(value || '')} /></div>
    <div className={styles.helpdeskSettingsGroups}>{groups.map(group=>{
      const items=visible.filter(link=>link.group===group.key);
      return items.length ? <section key={group.key} data-tone={group.tone}><h3><span>{group.title}</span></h3>{items.map(link=><button type="button" key={link.key} data-tone={tones[link.key] || group.tone} onClick={()=>onOpen(link.key)}><Icon className={styles.settingsLinkIcon} iconName={link.icon} /><span>{link.title}</span><Icon iconName="ChevronRight" /></button>)}</section> : null;
    })}</div>
    {!visible.length && <p>No settings match your search.</p>}
  </div>;
}
