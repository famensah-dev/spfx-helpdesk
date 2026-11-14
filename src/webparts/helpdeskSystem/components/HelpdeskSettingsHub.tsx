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
      row.dataset.settingsSelectable=String(headers[0]==='Select');
      Array.from(row.cells).forEach(cell=>{
        if(cell.tagName==='TD'){
          const label=headers[index] || (cell.querySelector('button, a') ? 'Actions' : 'Details');
          cell.dataset.settingsLabel=label;
          if(index===(headers[0]==='Select' ? 1 : 0))cell.dataset.settingsPrimary='true';
          else delete cell.dataset.settingsPrimary;
        }
        index+=cell.colSpan;
      });
      const primary=row.querySelector<HTMLElement>('[data-settings-primary="true"]');
      const details=Array.from(row.cells).filter(cell=>cell.tagName==='TD' && cell!==primary && cell.dataset.settingsLabel!=='Select');
      if(!primary || !details.length)return;
      const summary=details.find(cell=>!cell.querySelector('button, input, [role="switch"], [role="checkbox"]') && cell.dataset.settingsLabel!=='Actions');
      details.forEach(cell=>{cell.dataset.settingsSummary=String(cell===summary);});
      if(!row.dataset.settingsExpanded)row.dataset.settingsExpanded='false';
      if(primary.querySelector('[data-settings-expand]'))return;
      const toggle=root.ownerDocument.createElement('button');toggle.type='button';toggle.dataset.settingsExpand='true';toggle.textContent='';toggle.setAttribute('aria-expanded',row.dataset.settingsExpanded);toggle.setAttribute('aria-label',row.dataset.settingsExpanded==='true' ? 'Hide item details' : 'Show item details');
      toggle.onclick=event=>{event.stopPropagation();const expanded=row.dataset.settingsExpanded!=='true';row.dataset.settingsExpanded=String(expanded);toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-label',expanded ? 'Hide item details' : 'Show item details');};
      const chevron=root.ownerDocument.createElementNS('http://www.w3.org/2000/svg','svg');chevron.setAttribute('viewBox','0 0 16 16');chevron.setAttribute('width','14');chevron.setAttribute('height','14');chevron.setAttribute('aria-hidden','true');chevron.setAttribute('focusable','false');
      const path=root.ownerDocument.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M6 3l5 5-5 5');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.6');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');chevron.append(path);toggle.append(chevron);
      primary.append(toggle);
    }));
  });
}
export function HelpdeskSettingsHub({links,onOpen,activeKey,disabled,children,sectionActions,sectionTitle,detailName,onDetailBack}:{links:IHelpdeskSettingLink[];onOpen:(key:string)=>void;activeKey?:string;disabled?:boolean;children?:React.ReactNode;sectionActions?:React.ReactNode;sectionTitle?:string;detailName?:string;onDetailBack?:()=>void}):React.ReactElement {
  const [query,setQuery]=React.useState('');
  const [menuOpen,setMenuOpen]=React.useState(false);
  const workspaceRef=React.useRef<HTMLDivElement>(null);
  const contentRef=React.useRef<HTMLDivElement>(null);
  React.useEffect(()=>{
    const root=workspaceRef.current;
    if(!root)return;
    let frame=0;
    const measure=():void=>{
      const top=Math.max(0,root.getBoundingClientRect().top);
      const value=`${top}px`;
      const height=`${Math.max(0,(window.visualViewport?.height || window.innerHeight)-top)}px`;
      if(root.style.getPropertyValue('--settings-top')!==value)root.style.setProperty('--settings-top',value);
      if(root.style.getPropertyValue('--settings-height')!==height)root.style.setProperty('--settings-height',height);
    };
    const schedule=():void=>{window.cancelAnimationFrame(frame);frame=window.requestAnimationFrame(measure);};
    measure();
    window.addEventListener('resize',schedule);
    window.addEventListener('scroll',schedule,true);
    window.visualViewport?.addEventListener('resize',schedule);
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(schedule):undefined;
    if(root.parentElement)observer?.observe(root.parentElement);
    return ()=>{window.cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);window.visualViewport?.removeEventListener('resize',schedule);observer?.disconnect();};
  },[]);
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
  const groups=[{key:'',title:'',tone:'slate'},{key:'People & Teams',title:'People',tone:'blue'},{key:'Ticket Configuration',title:'Tickets',tone:'green'},{key:'Automation',title:'Automation',tone:'amber'},{key:'Knowledge Base',title:'Knowledge Base',tone:'purple'},{key:'Advanced',title:'Advanced',tone:'slate'}];
  const tones:Record<string,string>={units:'blue',members:'purple',usersRoles:'purple',roles:'purple',categories:'green',subcategories:'cyan',issueTypes:'cyan',sla:'amber',assignment:'amber',faqs:'purple',schema:'slate'};
  const navigation=(mobile=false):React.ReactElement=><nav className={`${layout.sidebar} ${mobile ? layout.mobileSidebar : ''}`} aria-label="Settings sections">{groups.map(group=>{
      const items=visible.filter(link=>link.group===group.key);
      return items.length ? <section key={group.key}>{group.title && <h3>{group.title}</h3>}{items.map(link=><button type="button" key={link.key} data-tone={tones[link.key] || group.tone} data-active={activeKey===link.key} aria-current={activeKey===link.key?'page':undefined} disabled={disabled} title={link.description} onClick={()=>{onOpen(link.key);setMenuOpen(false);}}><Icon className={styles.settingsLinkIcon} iconName={link.icon} /><span>{link.title}</span></button>)}</section> : null;
    })}{!visible.length && <p className={layout.noResults}>No settings match your search.</p>}</nav>;
  return <div ref={workspaceRef} className={layout.workspace} data-settings-workspace="true">
    <div className={layout.heading}><h2>Settings</h2><button type="button" className={layout.mobileMenuButton} aria-label="Open settings menu" aria-haspopup="dialog" aria-expanded={menuOpen} disabled={disabled} onClick={()=>setMenuOpen(true)}><Icon iconName="GlobalNavButton" /></button><SearchBox ariaLabel="Search settings" placeholder="Find a setting" value={query} onChange={(_,value)=>setQuery(value || '')} /></div>
    {menuOpen && <Panel isOpen type={PanelType.smallFixedNear} headerText="Settings" closeButtonAriaLabel="Close settings menu" isLightDismiss onDismiss={()=>setMenuOpen(false)} styles={{main:{background:'var(--dp-bg-fff, #fff)',color:'var(--dp-fg-172536, #172536)'},content:{padding:'0 12px 20px'},headerText:{color:'var(--dp-fg-172536, #172536)'}}}><SearchBox ariaLabel="Search settings menu" placeholder="Find a setting" value={query} onChange={(_,value)=>setQuery(value || '')} />{navigation(true)}</Panel>}
    <div className={layout.settingsSplitLayout}>{navigation()}<div ref={contentRef} className={layout.content} data-mobile-tables={activeKey==='schema' ? 'table' : 'list'}>
      {active && <header className={layout.settingsSectionHeader}><div><h2>{sectionTitle || active.title}</h2>{!detailName && <p>{active.description}</p>}</div>{sectionActions && <div className={layout.sectionActions}>{sectionActions}</div>}</header>}
    <nav className={layout.breadcrumbs} aria-label="Settings breadcrumbs"><ol><li><button type="button" disabled={disabled} onClick={()=>onOpen('home')}>Settings</button></li>{active && <li aria-current={detailName?undefined:'page'}><svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false"><path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>{detailName?<button type="button" disabled={disabled || !onDetailBack} onClick={onDetailBack}>{active.title}</button>:active.title}</li>}{detailName && <li aria-current="page"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false"><path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>{detailName}</li>}</ol></nav>
      <div className={layout.body} data-role-detail={Boolean(detailName)}>{children}</div></div></div>
  </div>;
}
