import * as React from 'react';
import { IconButton, Label, Dropdown, DefaultButton, SearchBox } from '@fluentui/react';
import styles from './HelpdeskSystem.module.scss';
import { decodeHtmlEntities } from '../utils/decodeHtmlEntities';

export function safeDescriptionHtml(value: string): string {
  const doc = new DOMParser().parseFromString(value, 'text/html');
  const allowed = new Set(['P', 'DIV', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'UL', 'OL', 'LI', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'PRE', 'CODE', 'A', 'SPAN']);
  const clean = (parent: Node): void => {
    Array.from(parent.childNodes).forEach(node => {
      if (node.nodeType !== 1) { if (node.nodeType !== 3) node.parentNode?.removeChild(node); return; }
      const element = node as HTMLElement;
      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'SVG', 'MATH'].includes(element.tagName)) { element.remove(); return; }
      clean(element);
      if (!allowed.has(element.tagName)) { element.replaceWith(...Array.from(element.childNodes)); return; }
      const href = element.tagName === 'A' ? element.getAttribute('href') : null;
      const alignment = element.style.textAlign;
      Array.from(element.attributes).forEach(attribute => element.removeAttribute(attribute.name));
      if (['left', 'center', 'right'].includes(alignment)) element.style.textAlign = alignment;
      if (href && /^(https?:\/\/|mailto:)/i.test(href)) { element.setAttribute('href', href); element.setAttribute('target', '_blank'); element.setAttribute('rel', 'noopener noreferrer'); }
    });
  };
  clean(doc.body);
  return doc.body.innerHTML;
}
export function RichTextContent(props: { value: string }): React.ReactElement {
  return <div className={styles.markdownContent} dangerouslySetInnerHTML={{ __html: safeDescriptionHtml(props.value) }} />;
}
export function RichTextEditor(props: { value: string; label?: string; required?: boolean; disabled?: boolean; placeholders?:ReadonlyArray<{key:string;label:string}>; plainText?:boolean; onChange: (value: string) => void }): React.ReactElement {
  const host = React.useRef<HTMLDivElement>(null);
  const selection = React.useRef<Range | null>(null);
  const [inserting,setInserting]=React.useState(false);
  const [query,setQuery]=React.useState('');
  const decorate=():void=>{
    if(!props.placeholders || !host.current)return;
    const walker=document.createTreeWalker(host.current,NodeFilter.SHOW_TEXT);const nodes:Text[]=[];
    while(walker.nextNode())nodes.push(walker.currentNode as Text);
    for(const node of nodes){
      if(node.parentElement?.closest('[data-email-token]'))continue;
      const parts=(node.textContent || '').split(/({{\w+}})/g);if(parts.length===1)continue;
      const fragment=document.createDocumentFragment();
      for(const part of parts){const match=/^{{(\w+)}}$/.exec(part);if(!match){fragment.append(part);continue;}
        const badge=document.createElement('span');badge.dataset.emailToken=match[1];badge.contentEditable='false';badge.className=styles.emailPlaceholderBadge;
        badge.textContent=props.placeholders.find(token=>token.key===match[1])?.label || match[1].replace(/([a-z])([A-Z])/g,'$1 $2');badge.title=part;fragment.append(badge);
      }
      node.replaceWith(fragment);
    }
  };
  React.useEffect(() => {
    if (host.current && document.activeElement !== host.current) {
      if (props.plainText) host.current.textContent=props.value;
      else if (/<\/?(?:p|div|br|strong|b|em|ul|ol|h[234])\b/i.test(props.value)) host.current.innerHTML = safeDescriptionHtml(props.value);
      else host.current.textContent = decodeHtmlEntities(props.value);
      decorate();
    }
  }, [props.value]);
  const remember = (): void => { const current = window.getSelection(); if (current?.rangeCount && host.current?.contains(current.anchorNode)) selection.current = current.getRangeAt(0).cloneRange(); };
  const emit = (): void => {
    if(!host.current)return;
    const clone=host.current.cloneNode(true) as HTMLElement;
    clone.querySelectorAll<HTMLElement>('[data-email-token]').forEach(badge=>badge.replaceWith(document.createTextNode('{{'+badge.dataset.emailToken+'}}')));
    const plain=clone.textContent || '';
    props.onChange(props.plainText ? plain.replace(/[\r\n]/g,' ') : plain.trim() ? safeDescriptionHtml(clone.innerHTML) : '');
  };
  const command = (name: string, value?: string): void => {
    host.current?.focus();
    if (selection.current) { const current = window.getSelection(); current?.removeAllRanges(); current?.addRange(selection.current); }
    document.execCommand(name, false, value); remember(); emit();
  };
  return <div><Label required={props.required}>{props.label || 'Description'}</Label><div className={styles.markdownEditor}>
    {!props.plainText && <div className={styles.markdownToolbar} role="toolbar" aria-label="Description formatting">
      <Dropdown ariaLabel="Text style" disabled={props.disabled} defaultSelectedKey="p" options={[{ key: 'p', text: 'Normal Text' }, { key: 'h2', text: 'Heading' }, { key: 'h3', text: 'Subheading' }]} styles={{ root: { width: 140 } }} onChange={(_, option) => command('formatBlock', String(option?.key || 'p'))} />
      {[['Bold', 'bold'], ['Italic', 'italic'], ['Underline', 'underline'], ['Strikethrough', 'strikeThrough'], ['BulletedList', 'insertUnorderedList'], ['NumberedList', 'insertOrderedList'], ['AlignLeft', 'justifyLeft'], ['AlignCenter', 'justifyCenter'], ['ClearFormatting', 'removeFormat']].map(([icon, action]) => <IconButton key={action} iconProps={{ iconName: icon }} ariaLabel={icon} title={icon} disabled={props.disabled} onMouseDown={event => event.preventDefault()} onClick={() => command(action)} />)}
      <IconButton iconProps={{ iconName: 'Link' }} ariaLabel="Insert link" title="Insert link" disabled={props.disabled} onMouseDown={event => event.preventDefault()} onClick={() => { const url = window.prompt('Link URL (https://...)'); if (url && /^https?:\/\//i.test(url)) command('createLink', url); }} />
    </div>}
    <div ref={host} className={styles.richTextInput} style={props.plainText ? {minHeight:36,padding:'8px 10px'} : undefined} contentEditable={!props.disabled} suppressContentEditableWarning role="textbox" aria-label={props.label || 'Description'} aria-multiline={!props.plainText} aria-required={props.required} aria-disabled={props.disabled} tabIndex={0} onInput={emit} onKeyUp={remember} onMouseUp={remember} onBlur={remember} onKeyDown={event=>{if(props.plainText && event.key==='Enter')event.preventDefault();}}
      onPaste={event => { event.preventDefault(); command('insertText', event.clipboardData.getData('text/plain')); }} />
    {props.placeholders && <div className={styles.emailPlaceholderTools}>
      <DefaultButton className={styles.emailPlaceholderInsert} text="Insert Placeholder" iconProps={{iconName:'Variable'}} menuIconProps={{iconName:inserting ? 'ChevronUp' : 'ChevronDown'}} disabled={props.disabled} aria-expanded={inserting} onClick={()=>{setInserting(!inserting);setQuery('');}} />
      {inserting && <div><SearchBox ariaLabel="Search placeholders" placeholder="Find ticket information" value={query} onChange={(_,value)=>setQuery(value || '')} />
        <div className={styles.emailPlaceholderOptions}>{props.placeholders.filter(token=>(token.label+' '+token.key).toLowerCase().includes(query.toLowerCase())).map(token=><button type="button" key={token.key} disabled={props.disabled} onClick={()=>{
          const editor=host.current;if(!editor)return;editor.focus();const range=selection.current && editor.contains(selection.current.startContainer) ? selection.current : document.createRange();
          if(!selection.current || !editor.contains(range.startContainer)){range.selectNodeContents(editor);range.collapse(false);}
          range.deleteContents();const node=document.createTextNode('{{'+token.key+'}}');range.insertNode(node);range.setStartAfter(node);range.collapse(true);const current=window.getSelection();current?.removeAllRanges();current?.addRange(range);emit();decorate();selection.current=null;setInserting(false);
        }}>{token.label}</button>)}</div></div>}
    </div>}
  </div></div>;
}
