import * as React from 'react';
import { Icon, SearchBox } from '@fluentui/react';
import { documentationTopics, searchDocumentation } from './documentationContent';

export function DocumentationPage():React.ReactElement {
  const [query,setQuery]=React.useState('');
  const [selected,setSelected]=React.useState('start');
  const heading=React.useRef<HTMLHeadingElement>(null);
  const results=React.useMemo(()=>searchDocumentation(query),[query]);
  const topic=documentationTopics.find(item=>item.id===selected) || documentationTopics[0];
  const sections=Array.from(new Set(documentationTopics.map(item=>item.section)));
  const open=(id:string):void=>{
    setSelected(id);
    window.requestAnimationFrame(()=>heading.current?.focus());
  };
  return <section className="deskpilot-documentation" aria-label="Documentation">
    <header className="documentation-header"><div><h2>Documentation</h2><p>Your guide to using DeskPilot.</p></div><SearchBox ariaLabel="Search documentation" placeholder="Search tasks, roles, or questions" value={query} onChange={(_,value)=>{const text=value || '';setQuery(text);const matches=searchDocumentation(text);if(matches.length && !matches.some(item=>item.id===selected))setSelected(matches[0].id);}} /></header>
    <div className="documentation-layout">
      <nav className="documentation-topics" aria-label="Documentation topics">
        {query.trim() ? <>
          <p className="documentation-result-count" role="status">{results.length} {results.length===1?'topic':'topics'} found</p>
          {results.map(item=><button type="button" key={item.id} aria-current={item.id===selected?'page':undefined} onClick={()=>open(item.id)}><span>{item.title}</span><small>{item.summary}</small></button>)}
          {!results.length && <div className="documentation-empty"><p>No topics match “{query}”.</p><p>Try fewer words, a service action such as “assign”, or a role such as “agent”.</p><button type="button" onClick={()=>setQuery('')}>Browse All Topics</button></div>}
        </> : sections.map(section=><section key={section}><h3>{section}</h3>{documentationTopics.filter(item=>item.section===section).map(item=><button type="button" key={item.id} aria-current={item.id===selected?'page':undefined} onClick={()=>open(item.id)}>{item.title}</button>)}</section>)}
      </nav>
      <article className="documentation-article" aria-labelledby="documentation-topic-heading">
        <p className="documentation-section-name">{topic.section}</p>
        <h3 id="documentation-topic-heading" ref={heading} tabIndex={-1}>{topic.title}</h3>
        <p className="documentation-summary">{topic.summary}</p>
        {topic.paragraphs?.map(paragraph=><p key={paragraph}>{paragraph}</p>)}
        {topic.steps && <ol>{topic.steps.map(step=><li key={step}>{step}</li>)}</ol>}
        {topic.note && <aside className="documentation-note"><Icon iconName="Info" aria-hidden="true" /><p>{topic.note}</p></aside>}
        {!!topic.related?.length && <footer><h4>Related Topics</h4><div>{topic.related.map(id=>{const related=documentationTopics.find(item=>item.id===id);return related ? <button type="button" key={id} onClick={()=>open(id)}>{related.title}<Icon iconName="ChevronRight" aria-hidden="true" /></button> : null;})}</div></footer>}
      </article>
    </div>
  </section>;
}
