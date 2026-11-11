import * as React from 'react';
import { Icon, SearchBox, Panel, PanelType } from '@fluentui/react';
import styles from './HelpdeskSystem.module.scss';
import layout from './HelpdeskSettingsLayout.module.scss';
export interface IHelpdeskSettingLink {key:string;title:string;description:string;icon:string;group:string;}
/** Add visual field labels without replacing table controls or their accessible headers. */
export function labelSettingsTables(root:HTMLElement):void {
  root.querySelectorAll<HTMLTableElement>('table').forEach(table=>{
    if(table.hasAttribute('data-preserve-table')){delete table.dataset.settingsList;return;}
    const headerRow=table.tHead?.rows[table.tHead.rows.length-1];
    if(!headerRow)return;
    const headers=Array.from(headerRow.cells).map(cell=>{
      if(cell.querySelector('input[type="checkbox"], [role="checkbox"]'))return 'Select';
      return (cell.textContent || '').replace(/[\uE000-\uF8FF]/g,'').trim();
    });
    table.dataset.settingsList='true';
    Array.from(table.tBodies).forEach(body=>Array.from(body.rows).forEach(row=>{
      let index=0;
      Array.from(row.cells).forEach(cell=>{
        if(cell.tagName==='TD'){
          const label=headers[index] || (cell.querySelector('button, a') ? 'Actions' : 'Details');
          cell.dataset.settingsLabel=label;
          if(index===(headers[0]==='Select' ? 1 : 0))cell.dataset.settingsPrimary='true';
          else delete cell.dataset.settingsPrimary;
        }
        index+=cell.colSpan;
      });
    }));
  });
}
export function HelpdeskSettingsHub({links,onOpen,activeKey,disabled,children}:{links:IHelpdeskSettingLink[];onOpen:(key:string)=>void;activeKey?:string;disabled?:boolean;children?:React.ReactNode}):React.ReactElement {
  const [query,setQuery]=React.useState('');
  const [menuOpen,setMenuOpen]=React.useState(false);
  const contentRef=React.useRef<HTMLDivElement>(null);
  React.useEffect(()=>{
    const root=contentRef.current;
    if(!root || activeKey==='schema')return;
    labelSettingsTables(root);
    // Async loads, edits and pagination replace rows after the section first mounts.
    const observer=new window.MutationObserver(()=>labelSettingsTables(root));
    observer.observe(root,{childList:true,subtree:true,characterData:true});
    return()=>observer.disconnect();
  },[activeKey]);
  React.useEffect(()=>setMenuOpen(false),[activeKey]);
  const visible=links.filter(link=>`${link.title} ${link.description} ${link.group}`.toLowerCase().includes(query.trim().toLowerCase()));
  const active = links.find(link => link.key === activeKey);
  const groups=[{key:'People & Teams',title:'People',tone:'blue'},{key:'Ticket Configuration',title:'Tickets',tone:'green'},{key:'Automation',title:'Automation',tone:'amber'},{key:'Knowledge Base',title:'Knowledge Base',tone:'purple'},{key:'Advanced',title:'Advanced',tone:'slate'}];
  const tones:Record<string,string>={units:'blue',members:'purple',usersRoles:'purple',roles:'purple',categories:'green',subcategories:'cyan',issueTypes:'cyan',sla:'amber',assignment:'amber',faqs:'purple',schema:'slate'};
  const navigation=(mobile=false):React.ReactElement=><nav className={`${layout.sidebar} ${mobile ? layout.mobileSidebar : ''}`} aria-label="Settings sections">{groups.map(group=>{
      const items=visible.filter(link=>link.group===group.key);
      return items.length ? <section key={group.key}><h3>{group.title}</h3>{items.map(link=><button type="button" key={link.key} data-tone={tones[link.key] || group.tone} data-active={activeKey===link.key} aria-current={activeKey===link.key?'page':undefined} disabled={disabled} title={link.description} onClick={()=>{onOpen(link.key);setMenuOpen(false);}}><Icon className={styles.settingsLinkIcon} iconName={link.icon} /><span>{link.title}</span></button>)}</section> : null;
    })}{!visible.length && <p className={layout.noResults}>No settings match your search.</p>}</nav>;
  return <div className={layout.workspace}>
    <div className={layout.heading}><h2>Settings</h2><button type="button" className={layout.mobileMenuButton} aria-label="Open settings menu" aria-haspopup="dialog" aria-expanded={menuOpen} disabled={disabled} onClick={()=>setMenuOpen(true)}><Icon iconName="GlobalNavButton" /></button><SearchBox ariaLabel="Search settings" placeholder="Find a setting" value={query} onChange={(_,value)=>setQuery(value || '')} /></div>
    {menuOpen && <Panel isOpen type={PanelType.smallFixedNear} headerText="Settings" closeButtonAriaLabel="Close settings menu" isLightDismiss onDismiss={()=>setMenuOpen(false)} styles={{main:{background:'var(--dp-bg-fff, #fff)',color:'var(--dp-fg-172536, #172536)'},content:{padding:'0 12px 20px'},headerText:{color:'var(--dp-fg-172536, #172536)'}}}><SearchBox ariaLabel="Search settings menu" placeholder="Find a setting" value={query} onChange={(_,value)=>setQuery(value || '')} />{navigation(true)}</Panel>}
    <div className={layout.settingsSplitLayout}>{navigation()}<div ref={contentRef} className={layout.content} data-mobile-tables={activeKey==='schema' ? 'table' : 'list'}>{active && <header className={layout.settingsSectionHeader}><h2>{active.title}</h2><p>{active.description}</p></header>}{children}</div></div>
  </div>;
}
