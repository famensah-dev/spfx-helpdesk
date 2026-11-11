import * as React from 'react';
import { Dialog, Icon, SearchBox } from '@fluentui/react';
import { documentationTopics, searchDocumentation } from './documentationContent';
const groups=[
  {section:'Getting Started',label:'Getting Started',icon:'ReadingMode'},
  {section:'Working With Tickets',label:'Working With Tickets',icon:'Ticket'},
  {section:'Tracking Work',label:'Tracking Work',icon:'Chart'},
  {section:'Knowledge Base',label:'Knowledge Base',icon:'BookAnswers'},
  {section:'For Helpdesk Admins',label:'Administration',icon:'People'},
  {section:'Common Questions',label:'Troubleshooting',icon:'Repair'}
];
const quickStart=[
  {id:'create',title:'Create a Ticket',description:'Raise a new support request in a few steps.',icon:'CircleAddition',tone:'blue'},
  {id:'find',title:'Track a Ticket',description:'Check the status and updates on your requests.',icon:'Ticket',tone:'green'},
  {id:'knowledge-read',title:'Use the Knowledge Base',description:'Find answers to common questions.',icon:'BookAnswers',tone:'purple'},
  {id:'roles',title:'Understand Your Role',description:'See what you can do based on your access.',icon:'Contact',tone:'orange'}
];
const guideTerms=['Import/Export','Export Filtered Tickets (CSV)','Export Selected','Columns','Ticket Source','Ticket Category','Ticket Subcategory','Ticket Issue Type','Assigned to','Create Teams','Add Members','Add Users','All Departments','All Assigned To','All Categories','All Statuses','Sort Order','Team Email','Team Name','Auto-Assign New Tickets','Ticket Notifications','Send Invitation Automatically','Enable Invitation Email','Mark as Solution','Publish to Knowledge Base','Helpdesk Admins','Helpdesk Admin','Super Admin','Agents','Agent','Assigned To','My Assigned Tickets','Created by Me','All Tickets','Knowledge Base','Quick Help','Need Help','New Article','Create Ticket','Create a Ticket','Save Article','Save Changes','Attach Files','Show All Fields','Show Less','Publish This Article','Allow Agents to Edit This Article','Roles & Permissions','Edit Permissions','Restore Defaults','Send Invite','Insert Placeholder','Notification Rules','Email & Notifications','Sender Settings','Resolution Summary','Ticket List Schema','Initialize Workspace','Support Teams','SLA & Priorities','Round Robin','Team Lead','In Progress','Pending','Resolved','Closed','Dashboard','Settings','Priority','Requester Name','Requester Email','Ticket Type','Due Date','Category','Subcategory','Issue Type','Comments','Attachments','Activity','Resolve','Refresh','Export','Archives','Advanced Filter','Edit','Save','Discard','Post'];
const guideTermPattern=new RegExp('\\b('+guideTerms.sort((a,b)=>b.length-a.length).map(term=>term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')\\b','g');
export function emphasizeGuideText(value:string):React.ReactNode {
  return value.split(guideTermPattern).map((part,index)=>index%2 ? <strong key={index}>{part}</strong> : part);
}
export function DocumentationPage():React.ReactElement {
  const [query,setQuery]=React.useState('');
  const [searchOpen,setSearchOpen]=React.useState(false);
  const [selected,setSelected]=React.useState('overview');
  const [collapsed,setCollapsed]=React.useState<string[]>(()=>groups.slice(1).map(group=>group.section));
  const heading=React.useRef<HTMLHeadingElement>(null);
  const overviewHeading=React.useRef<HTMLHeadingElement>(null);
  const results=React.useMemo(()=>searchDocumentation(query),[query]);
  const topic=documentationTopics.find(item=>item.id===selected) || documentationTopics[0];
  const featureTopics=(section:string)=>documentationTopics.filter(item=>item.section===section).sort((a,b)=>Number(Boolean(b.featureOverview))-Number(Boolean(a.featureOverview)));
  const featureOverview=documentationTopics.find(item=>item.section===topic.section && item.featureOverview);
  const open=(id:string):void=>{
    setSelected(id);setQuery('');setSearchOpen(false);
    const section=documentationTopics.find(item=>item.id===id)?.section;
    if(section)setCollapsed(current=>current.filter(value=>value!==section));
    window.requestAnimationFrame(()=>{if(id==='overview')overviewHeading.current?.focus();else heading.current?.focus();});
  };
  const search=(text:string):void=>{setQuery(text);if(selected==='overview' && text.trim())setSearchOpen(true);};
  const sectionLinks=[...(topic.sections || []).map(section=>({id:'guide-'+section.id,label:section.title})),...(topic.paragraphs?.length ? [{id:'how',label:topic.featureOverview?'Overview':'How It Works'}] : []),...(topic.steps?.length ? [{id:'steps',label:'Steps'}] : []),...(topic.note ? [{id:'note',label:'Keep in Mind'}] : []),...(topic.featureOverview ? [{id:'topics',label:'In This Section'}] : []),...(topic.related?.length ? [{id:'related',label:'Related Topics'}] : [])];
  const searchControl=<SearchBox showIcon ariaLabel="Search user guide" placeholder="Search user guide" value={query} onChange={(_,value)=>search(value || '')} onSearch={()=>{if(!query.trim())return;if(selected==='overview')setSearchOpen(true);else if(results[0])open(results[0].id);}} />;
  return <section className="deskpilot-documentation" aria-label="User Guide">
    {searchOpen && <Dialog hidden={false} onDismiss={()=>setSearchOpen(false)} minWidth={320} maxWidth={640} dialogContentProps={{title:'Search User Guide',showCloseButton:true,styles:{title:{color:'var(--dp-fg-172536, #172536)'}}}} modalProps={{isBlocking:false,focusTrapZoneProps:{firstFocusableSelector:'.documentation-modal-search input'},styles:{main:{width:'min(640px, calc(100vw - 24px))',maxWidth:640,background:'var(--dp-bg-fff, #fff)',color:'var(--dp-fg-172536, #172536)'}}}}>
      <div className="documentation-modal-search"><SearchBox showIcon ariaLabel="Search user guide topics" placeholder="Search user guide" value={query} onChange={(_,value)=>setQuery(value || '')} /></div>
      <p className="documentation-modal-count" role="status">{query.trim() ? results.length+' '+(results.length===1?'topic':'topics')+' found' : 'Enter a word or question to find a topic.'}</p>
      <div className="documentation-search-results">{query.trim() && results.map(item=><button type="button" key={item.id} onClick={()=>open(item.id)}>{item.title}</button>)}</div>
      {query.trim() && !results.length && <p>No topics match your search. Try fewer words or another term.</p>}
    </Dialog>}
    <div className="documentation-layout">
      <nav className="documentation-topics" aria-label="User Guide topics">
        {selected!=='overview' && <div className="documentation-sidebar-search">{searchControl}</div>}
        <button type="button" className="documentation-home" aria-current={selected==='overview'?'page':undefined} onClick={()=>open('overview')}><Icon iconName="Home" />Getting Started</button>
        {selected!=='overview' && query.trim() ? <>
          <p className="documentation-result-count" role="status">{results.length} {results.length===1?'topic':'topics'} found</p>
          {results.map(item=><button type="button" key={item.id} aria-current={item.id===selected?'page':undefined} onClick={()=>open(item.id)}><span>{item.title}</span></button>)}
          {!results.length && <div className="documentation-empty"><p>No topics match "{query}".</p><p>Try fewer words, an action such as "assign", or a role such as "agent".</p><button type="button" onClick={()=>setQuery('')}>Browse All Topics</button></div>}
        </> : groups.map(group=><section key={group.section}>
          <h3><button className="documentation-group-toggle" type="button" aria-expanded={!collapsed.includes(group.section)} aria-controls={'documentation-group-'+groups.indexOf(group)} onClick={()=>setCollapsed(current=>current.includes(group.section)?current.filter(value=>value!==group.section):[...current,group.section])}><Icon iconName={collapsed.includes(group.section)?'ChevronRight':'ChevronDown'} /><span>{group.label}</span></button></h3>
          <div id={'documentation-group-'+groups.indexOf(group)} hidden={collapsed.includes(group.section)} className="documentation-topic-tree">{featureTopics(group.section).map(item=><button type="button" key={item.id} aria-current={item.id===selected?'page':undefined} onClick={()=>open(item.id)}>{item.title}</button>)}</div>
        </section>)}
      </nav>
      <div className="documentation-main">
        {selected==='overview' && <header className="documentation-hero">
          <h2 ref={overviewHeading} tabIndex={-1}>DeskPilot User Guide</h2>
          <p>Your guide to using DeskPilot effectively, from getting started to managing tickets, resolving requests and more.</p>
          <div className="documentation-theme-search" role="search">{searchControl}</div>
        </header>}
        {selected==='overview' ? <>
          <section className="documentation-overview-section" aria-labelledby="documentation-quick-start"><header><Icon iconName="Rocket" /><div><h3 id="documentation-quick-start">Quick Start</h3><p>Common tasks to help you get up and running quickly.</p></div></header>
            <div className="documentation-quick-grid">{quickStart.map(item=><button type="button" key={item.id} data-tone={item.tone} onClick={()=>open(item.id)}><Icon iconName={item.icon} /><strong>{item.title}</strong><span>{item.description}</span><Icon iconName="Forward" /></button>)}</div>
          </section>
          <section className="documentation-overview-section" aria-labelledby="documentation-browse"><header><div><h3 id="documentation-browse">Browse User Guide</h3><p>Explore detailed guides organised by topic.</p></div></header>
            <div className="documentation-browse-grid">{groups.map((group,index)=><button type="button" key={group.section} data-tone={['blue','purple','green'][index%3]} onClick={()=>open(featureTopics(group.section)[0].id)}><Icon iconName={group.icon} /><strong>{group.label}</strong><span>{({ 'Getting Started':'Learn about roles, navigation and key features.', 'Working With Tickets':'Find, create, update, resolve and export tickets to Excel.', 'Tracking Work':'Understand priorities, SLA targets and reports.', 'Knowledge Base':'Find, write and maintain helpful articles.', 'For Helpdesk Admins':'Manage users, permissions, teams, routing and notifications.', 'Common Questions':'Find solutions to common issues and get help faster.' } as Record<string,string>)[group.section]}</span><small>View Topics <Icon iconName="Forward" /></small></button>)}</div>
          </section>
        </> : <article className="documentation-article" aria-labelledby="documentation-topic-heading"><div className="documentation-reading">
          <nav className="documentation-breadcrumb" aria-label="Breadcrumb"><button type="button" onClick={()=>open('overview')}>User Guide</button><Icon iconName="ChevronRight" aria-hidden="true" /><button type="button" onClick={()=>featureOverview && open(featureOverview.id)}>{topic.section}</button><Icon iconName="ChevronRight" aria-hidden="true" /><span aria-current="page">{topic.title}</span></nav>
          <h3 id="documentation-topic-heading" ref={heading} tabIndex={-1}>{topic.title}</h3><p className="documentation-summary">{emphasizeGuideText(topic.summary)}</p>
          <div className="documentation-meta"><span><Icon iconName="People" aria-hidden="true" />{topic.section==='For Helpdesk Admins'?'Helpdesk Admins':'All Roles'}</span></div>
          <nav className="documentation-on-page" aria-label="On this page"><span>On this page:</span>{sectionLinks.map(link=><button type="button" key={link.id} onClick={()=>document.getElementById('documentation-section-'+link.id)?.focus()}>{link.label}</button>)}</nav>
          {!!topic.paragraphs?.length && <section aria-labelledby="documentation-section-how"><h4 id="documentation-section-how" tabIndex={-1}>{topic.featureOverview ? 'Overview' : 'How It Works'}</h4>{topic.paragraphs.map(paragraph=><p key={paragraph}>{emphasizeGuideText(paragraph)}</p>)}</section>}
          {topic.sections?.map(section=><section key={section.id} aria-labelledby={'documentation-section-guide-'+section.id}><h4 id={'documentation-section-guide-'+section.id} tabIndex={-1}>{section.title}</h4>{section.paragraphs.map(paragraph=><p key={paragraph}>{emphasizeGuideText(paragraph)}</p>)}</section>)}
          {topic.steps && <section aria-labelledby="documentation-section-steps"><h4 id="documentation-section-steps" tabIndex={-1}>Steps</h4><ol>{topic.steps.map(step=><li key={step}>{emphasizeGuideText(step)}</li>)}</ol></section>}
          {topic.featureOverview && <section className="documentation-feature-index" aria-labelledby="documentation-section-topics"><h4 id="documentation-section-topics" tabIndex={-1}>In This Section</h4><ul>{featureTopics(topic.section).filter(item=>!item.featureOverview).map(item=><li key={item.id}><button type="button" onClick={()=>open(item.id)}>{item.title}</button><p>{item.summary}</p></li>)}</ul></section>}
          {topic.note && <aside className="documentation-note" aria-label="Keep in mind" id="documentation-section-note" tabIndex={-1}><Icon iconName="Info" aria-hidden="true" /><p>{emphasizeGuideText(topic.note)}</p></aside>}
          {!!topic.related?.length && <footer><h4 id="documentation-section-related" tabIndex={-1}>Related Topics</h4><div>{topic.related.map(id=>{const related=documentationTopics.find(item=>item.id===id);return related ? <button type="button" key={id} onClick={()=>open(id)}>{related.title}<Icon iconName="ChevronRight" aria-hidden="true" /></button> : null;})}</div></footer>}
        </div></article>}
      </div>
    </div>
  </section>;
}
