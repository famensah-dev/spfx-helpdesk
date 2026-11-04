import * as React from 'react';
import { Icon, SearchBox } from '@fluentui/react';
import styles from './HelpdeskSystem.module.scss';
import layout from './HelpdeskSettingsLayout.module.scss';
export interface IHelpdeskSettingLink {key:string;title:string;description:string;icon:string;group:string;}
export function HelpdeskSettingsHub({links,onOpen,activeKey,disabled,children}:{links:IHelpdeskSettingLink[];onOpen:(key:string)=>void;activeKey?:string;disabled?:boolean;children?:React.ReactNode}):React.ReactElement {
  const [query,setQuery]=React.useState('');
  const visible=links.filter(link=>`${link.title} ${link.description} ${link.group}`.toLowerCase().includes(query.trim().toLowerCase()));
  const active = links.find(link => link.key === activeKey);
  const groups=[{key:'People & Teams',title:'People',tone:'blue'},{key:'Ticket Configuration',title:'Tickets',tone:'green'},{key:'Automation',title:'Automation',tone:'amber'},{key:'Knowledge Base',title:'Knowledge Base',tone:'purple'},{key:'Advanced',title:'Advanced',tone:'slate'}];
  const tones:Record<string,string>={units:'blue',members:'purple',usersRoles:'purple',roles:'purple',categories:'green',subcategories:'cyan',issueTypes:'cyan',sla:'amber',assignment:'amber',faqs:'purple',schema:'slate'};
  return <div className={layout.workspace}>
    <div className={layout.heading}><h2>Settings</h2><SearchBox ariaLabel="Search settings" placeholder="Find a setting" value={query} onChange={(_,value)=>setQuery(value || '')} /></div>
    <div className={layout.settingsSplitLayout}><nav className={layout.sidebar} aria-label="Settings sections">{groups.map(group=>{
      const items=visible.filter(link=>link.group===group.key);
      return items.length ? <section key={group.key}><h3>{group.title}</h3>{items.map(link=><button type="button" key={link.key} data-tone={tones[link.key] || group.tone} data-active={activeKey===link.key} aria-current={activeKey===link.key?'page':undefined} disabled={disabled} title={link.description} onClick={()=>onOpen(link.key)}><Icon className={styles.settingsLinkIcon} iconName={link.icon} /><span>{link.title}</span></button>)}</section> : null;
    })}{!visible.length && <p className={layout.noResults}>No settings match your search.</p>}</nav><div className={layout.content}>{active && <header className={layout.settingsSectionHeader}><h2>{active.title}</h2><p>{active.description}</p></header>}{children}</div></div>
  </div>;
}
