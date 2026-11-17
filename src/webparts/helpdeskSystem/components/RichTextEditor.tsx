import * as React from 'react';
import { IconButton, Icon, Callout, Label, Dropdown, DefaultButton, SearchBox } from '@fluentui/react';
import styles from './HelpdeskSystem.module.scss';
import { decodeHtmlEntities } from '../utils/decodeHtmlEntities';

export function safeDescriptionHtml(value: string): string {
  const doc = new DOMParser().parseFromString(value, 'text/html');
  const allowed = new Set(['P', 'DIV', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'UL', 'OL', 'LI', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'PRE', 'CODE', 'A', 'SPAN', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'CAPTION']);
  const clean = (parent: Node): void => {
    Array.from(parent.childNodes).forEach(node => {
      if (node.nodeType !== 1) { if (node.nodeType !== 3) node.parentNode?.removeChild(node); return; }
      const element = node as HTMLElement;
      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'SVG', 'MATH'].includes(element.tagName)) { element.remove(); return; }
      clean(element);
      if (!allowed.has(element.tagName)) { element.replaceWith(...Array.from(element.childNodes)); return; }
      const href = element.tagName === 'A' ? element.getAttribute('href') : null;
      const alignment = element.style.textAlign;
      const tableWidth = element.tagName==='TABLE' ? element.style.width : '';
      const scope=element.getAttribute('scope');
      const colspan=element.getAttribute('colspan'),rowspan=element.getAttribute('rowspan');
      Array.from(element.attributes).forEach(attribute => element.removeAttribute(attribute.name));
      if(element.tagName==='TH' && ['col','row'].includes(scope || ''))element.setAttribute('scope',scope!);
      if(['TH','TD'].includes(element.tagName))for(const [name,value] of [['colspan',colspan],['rowspan',rowspan]])if(value && /^[1-9]\d?$/.test(value) && Number(value)<=20)element.setAttribute(name!,value);
      if (['left', 'center', 'right'].includes(alignment)) element.style.textAlign = alignment;
      if (/^(?:[1-9]\d?|100)(?:\.\d+)?%$/.test(tableWidth) && parseFloat(tableWidth)<=100) element.style.width=tableWidth;
      if (href && /^(https?:\/\/|mailto:)/i.test(href)) { element.setAttribute('href', href); element.setAttribute('target', '_blank'); element.setAttribute('rel', 'noopener noreferrer'); }
    });
  };
  clean(doc.body);
  return doc.body.innerHTML;
}
export function RichTextContent(props: { value: string }): React.ReactElement {
  return <div className={styles.markdownContent} dangerouslySetInnerHTML={{ __html: safeDescriptionHtml(props.value) }} />;
}
export function editorTableHtml(rows:number,columns:number,includesHeader=false):string {
  if(!Number.isInteger(rows)||!Number.isInteger(columns)||rows<1||rows>20||columns<1||columns>12)throw new Error('Use 1 to 20 rows and 1 to 12 columns.');
  return '<table><thead><tr>'+Array.from({length:columns},(_,index)=>'<th scope="col">Header '+(index+1)+'</th>').join('')+'</tr></thead><tbody>'+Array.from({length:includesHeader ? rows-1 : rows},()=>'<tr>'+Array.from({length:columns},()=>'<td><br></td>').join('')+'</tr>').join('')+'</tbody></table><p><br></p>';
}
export function TablePickerButton(props:{disabled?:boolean;onInsert:(html:string)=>void}):React.ReactElement {
  const [anchor,setAnchor]=React.useState<HTMLElement>();
  const [size,setSize]=React.useState({rows:1,columns:1});
  const cells=React.useRef<Array<HTMLButtonElement|null>>([]);
  const choose=(rows:number,columns:number):void=>{if(props.disabled)return;props.onInsert(editorTableHtml(rows,columns,true));setAnchor(undefined);};
  return <><IconButton data-table-picker-button="true" ariaLabel="Insert table" title="Insert table" disabled={props.disabled} aria-haspopup="dialog" aria-expanded={Boolean(anchor)} styles={{root:{width:38,minWidth:38}}} onRenderIcon={()=> <span data-table-picker-trigger="true"><Icon iconName="Table" /><Icon iconName="ChevronDown" /></span>} onMouseDown={event=>event.preventDefault()} onClick={event=>{setSize({rows:1,columns:1});setAnchor(anchor ? undefined : event.currentTarget as HTMLElement);}} />
    {anchor && !props.disabled && <Callout target={anchor} onDismiss={()=>setAnchor(undefined)} setInitialFocus styles={{calloutMain:{padding:12,maxWidth:'calc(100vw - 24px)'}}}>
      <div data-table-picker="true" role="dialog" aria-label="Insert table">
        <div data-table-picker-size="true" role="status" aria-live="polite">{size.columns} × {size.rows} table</div>
        <div data-table-size-grid="true" role="grid" aria-label="Choose table size, up to 10 rows and 10 columns">
          {Array.from({length:10},(_,row)=><div role="row" key={row}>{Array.from({length:10},(_,column)=><button type="button" role="gridcell" key={column} ref={node=>{cells.current[row*10+column]=node;}} aria-label={`${column+1} columns, ${row+1} rows`} aria-selected={row<size.rows && column<size.columns} tabIndex={row===size.rows-1 && column===size.columns-1 ? 0 : -1} data-selected={row<size.rows && column<size.columns} onMouseEnter={()=>setSize({rows:row+1,columns:column+1})} onFocus={()=>setSize({rows:row+1,columns:column+1})} onClick={()=>choose(row+1,column+1)} onKeyDown={event=>{
            if(event.key==='Enter' || event.key===' '){event.preventDefault();choose(row+1,column+1);return;}
            const nextRow=Math.max(0,Math.min(9,row+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0)));
            const nextColumn=Math.max(0,Math.min(9,column+(event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0)));
            if(nextRow!==row || nextColumn!==column){event.preventDefault();cells.current[nextRow*10+nextColumn]?.focus();}
          }} />)}</div>)}
        </div>
        <small>Includes a header row. Add columns at a table border, up to 12.</small>
      </div>
    </Callout>}
  </>;
}
function simpleTable(table:HTMLTableElement):boolean {
  return !Array.from(table.querySelectorAll<HTMLTableCellElement>('th,td')).some(cell=>cell.rowSpan!==1 || cell.colSpan!==1 || cell.closest('table')!==table);
}
export function insertEditorTableRow(table:HTMLTableElement,index:number):HTMLTableCellElement|undefined {
  if(!simpleTable(table) || !table.rows.length)return undefined;
  const count=table.rows[0].cells.length;
  const headerRows=table.tHead?.rows.length || (table.rows[0].querySelector('th') ? 1 : 0);
  const next=table.rows[Math.max(headerRows,index)];
  const body=next?.parentElement?.tagName==='TBODY' ? next.parentElement : table.tBodies[0] || table.createTBody();
  const row=document.createElement('tr');
  for(let i=0;i<count;i++){const cell=document.createElement('td');cell.appendChild(document.createElement('br'));row.appendChild(cell);}
  body.insertBefore(row,next?.parentElement===body ? next : null);
  return row.cells[0];
}
export function insertEditorTableColumn(table:HTMLTableElement,index:number):HTMLTableCellElement|undefined {
  if(!simpleTable(table) || !table.rows.length || table.rows[0].cells.length>=12)return undefined;
  for(const row of Array.from(table.rows)){
    const header=row.parentElement?.tagName==='THEAD' || Array.from(row.cells).every(cell=>cell.tagName==='TH');
    const cell=document.createElement(header ? 'th' : 'td');
    if(header){cell.setAttribute('scope','col');cell.textContent='Header';}else cell.appendChild(document.createElement('br'));
    row.insertBefore(cell,row.cells[index] || null);
  }
  return table.rows[0].cells[index];
}
export function TableBorderControls(props:{editor:React.RefObject<HTMLDivElement>;disabled?:boolean;onChange:()=>void;onSelection:()=>void}):React.ReactElement|null {
  const [target,setTarget]=React.useState<{table:HTMLTableElement;kind:'row'|'column';index:number;left:number;top:number}>();
  React.useEffect(()=>{
    const editor=props.editor.current;if(!editor || props.disabled){setTarget(undefined);return;}
    const click=(event:MouseEvent):void=>{
      const element=event.target instanceof Element ? event.target : undefined;
      let cell=element?.closest<HTMLTableCellElement>('td,th');
      const table=cell?.closest('table') || element?.closest('table') || Array.from(editor.querySelectorAll('table')).find(item=>{const bounds=item.getBoundingClientRect();return event.clientX>=bounds.left-6 && event.clientX<=bounds.right+6 && event.clientY>=bounds.top-6 && event.clientY<=bounds.bottom+6;});
      if(table && !cell)cell=Array.from(table.querySelectorAll<HTMLTableCellElement>('td,th')).find(item=>{const bounds=item.getBoundingClientRect();return event.clientX>=bounds.left-6 && event.clientX<=bounds.right+6 && event.clientY>=bounds.top-6 && event.clientY<=bounds.bottom+6;}) || null;
      const row=cell?.parentElement as HTMLTableRowElement|undefined;
      if(!cell || !table || !row || !editor.contains(table) || !simpleTable(table)){setTarget(undefined);return;}
      const bounds=cell.getBoundingClientRect(),rowBounds=row.getBoundingClientRect(),tableBounds=table.getBoundingClientRect(),surface=editor.parentElement!.getBoundingClientRect();
      const edges:Array<{kind:'row'|'column';distance:number;index:number;left:number;top:number}>=[
        {kind:'row',distance:Math.abs(event.clientY-rowBounds.top),index:row.rowIndex,left:tableBounds.left-surface.left,top:rowBounds.top-surface.top-10},
        {kind:'row',distance:Math.abs(event.clientY-rowBounds.bottom),index:row.rowIndex+1,left:tableBounds.left-surface.left,top:rowBounds.bottom-surface.top-10},
        {kind:'column',distance:Math.abs(event.clientX-bounds.left),index:cell.cellIndex,left:bounds.left-surface.left-10,top:tableBounds.top-surface.top},
        {kind:'column',distance:Math.abs(event.clientX-bounds.right),index:cell.cellIndex+1,left:bounds.right-surface.left-10,top:tableBounds.top-surface.top}
      ];
      const edge=edges.sort((a,b)=>a.distance-b.distance)[0];
      if(edge.distance>6 || (edge.kind==='column' && table.rows[0].cells.length>=12)){setTarget(undefined);return;}
      setTarget({table,kind:edge.kind,index:edge.index,left:Math.max(0,edge.left),top:Math.max(0,edge.top)});
    };
    const hide=():void=>setTarget(undefined);
    const outside=(event:MouseEvent):void=>{if(!editor.parentElement?.contains(event.target as Node))hide();};
    editor.addEventListener('click',click);editor.addEventListener('input',hide);document.addEventListener('mousedown',outside);window.addEventListener('resize',hide);window.addEventListener('scroll',hide,true);
    return()=>{editor.removeEventListener('click',click);editor.removeEventListener('input',hide);document.removeEventListener('mousedown',outside);window.removeEventListener('resize',hide);window.removeEventListener('scroll',hide,true);};
  },[props.editor,props.disabled]);
  if(props.disabled)return null;
  return <><TableObjectControls {...props} />{target && <button type="button" data-table-border-action="true" style={{left:target.left,top:target.top}} aria-label={target.kind==='row' ? 'Insert row here' : 'Insert column here'} title={target.kind==='row' ? 'Insert row here' : 'Insert column here'} onMouseDown={event=>event.preventDefault()} onClick={()=>{
    if(!props.editor.current?.contains(target.table))return;
    const cell=target.kind==='row' ? insertEditorTableRow(target.table,target.index) : insertEditorTableColumn(target.table,target.index);
    if(cell){props.editor.current.focus();const range=document.createRange();range.selectNodeContents(cell);range.collapse(true);const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);props.onChange();props.onSelection();}
    setTarget(undefined);
  }}>+</button>}</>;
}
function TableObjectControls(props:{editor:React.RefObject<HTMLDivElement>;onChange:()=>void;onSelection:()=>void}):React.ReactElement|null {
  const [table,setTable]=React.useState<HTMLTableElement>();
  const [menu,setMenu]=React.useState<{left:number;top:number}>();
  const [,refresh]=React.useReducer(value=>value+1,0);
  const latest=React.useRef(props);latest.current=props;
  const cleanup=React.useRef<(()=>void)>();
  React.useEffect(()=>{
    const editor=props.editor.current;if(!editor)return;
    const select=(event:MouseEvent):void=>{
      const selected=(event.target as Element).closest?.('table');
      setTable(selected && editor.contains(selected) ? selected : undefined);setMenu(undefined);
      if(event.type==='contextmenu' && selected && editor.contains(selected)){
        event.preventDefault();const bounds=editor.parentElement!.getBoundingClientRect();
        setMenu({left:Math.max(0,Math.min(event.clientX-bounds.left,bounds.width-150)),top:event.clientY-bounds.top});
      }
    };
    const outside=(event:MouseEvent):void=>{if(!editor.parentElement?.contains(event.target as Node)){setTable(undefined);setMenu(undefined);}};
    const update=():void=>{setMenu(undefined);refresh();};
    editor.addEventListener('click',select);editor.addEventListener('contextmenu',select);editor.addEventListener('input',update);
    document.addEventListener('mousedown',outside);window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
    return()=>{cleanup.current?.();editor.removeEventListener('click',select);editor.removeEventListener('contextmenu',select);editor.removeEventListener('input',update);document.removeEventListener('mousedown',outside);window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};
  },[props.editor]);
  const editor=props.editor.current;
  if(!table || !editor?.contains(table))return null;
  const bounds=table.getBoundingClientRect(),surface=editor.parentElement!.getBoundingClientRect();
  const finish=():void=>{latest.current.onChange();latest.current.onSelection();refresh();};
  const gesture=(event:React.PointerEvent<HTMLButtonElement>,resize:boolean):void=>{
    event.preventDefault();setMenu(undefined);cleanup.current?.();
    const startX=event.clientX,initialWidth=bounds.width,oldWidth=table.style.width;
    let moved=false;
    const move=(next:PointerEvent):void=>{
      moved=moved || Math.abs(next.clientX-startX)>3 || Math.abs(next.clientY-event.clientY)>3;
      if(resize){const available=editor.clientWidth-parseFloat(getComputedStyle(editor).paddingLeft || '0')-parseFloat(getComputedStyle(editor).paddingRight || '0');
        if(available>0)table.style.width=Math.max(10,Math.min(100,(initialWidth+next.clientX-startX)/available*100)).toFixed(2)+'%';refresh();}
    };
    const end=(next:PointerEvent):void=>{
      cleanup.current?.();
      if(!resize && moved){
        const doc=document as Document & {caretRangeFromPoint?:(x:number,y:number)=>Range|null;caretPositionFromPoint?:(x:number,y:number)=>{offsetNode:Node;offset:number}|null};
        let range=doc.caretRangeFromPoint?.(next.clientX,next.clientY);
        if(!range){const caret=doc.caretPositionFromPoint?.(next.clientX,next.clientY);if(caret){range=document.createRange();range.setStart(caret.offsetNode,caret.offset);range.collapse(true);}}
        if(range && editor.contains(range.startContainer) && !table.contains(range.startContainer)){
          const block=(range.startContainer.nodeType===1 ? range.startContainer as Element : range.startContainer.parentElement)?.closest('p,div,table,ul,ol,blockquote,h2,h3,h4');
          if(block && block!==editor && editor.contains(block)){range.setStartBefore(block);range.collapse(true);range.insertNode(table);}
          else {range.collapse(true);range.insertNode(table);}
        }
      }
      finish();
    };
    const cancel=():void=>{if(resize)table.style.width=oldWidth;cleanup.current?.();refresh();};
    cleanup.current=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',cancel);cleanup.current=undefined;};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);window.addEventListener('pointercancel',cancel);
  };
  return <>
    <button type="button" data-table-handle="move" aria-label="Move table" title="Drag to move table" style={{left:Math.max(0,bounds.left-surface.left-8),top:Math.max(0,bounds.top-surface.top-8)}} onPointerDown={event=>gesture(event,false)} onKeyDown={event=>{if(event.key==='Escape'){setTable(undefined);setMenu(undefined);}}}>✥</button>
    <button type="button" data-table-handle="resize" aria-label="Resize table" title="Drag to resize table width" style={{left:bounds.right-surface.left-6,top:bounds.bottom-surface.top-6}} onPointerDown={event=>gesture(event,true)} />
    {menu && <div data-table-context-menu="true" role="menu" style={menu} onKeyDown={event=>{if(event.key==='Escape')setMenu(undefined);}}><button autoFocus type="button" role="menuitem" onClick={()=>{table.remove();setTable(undefined);setMenu(undefined);editor.focus();finish();}}>Delete table</button></div>}
  </>;
}
export function handleTableTab(event:React.KeyboardEvent<HTMLElement>,editor:HTMLElement,onChange:()=>void):void {
  if(event.key!=='Tab')return;
  const selection=window.getSelection(),anchor=selection?.anchorNode;
  const cell=(anchor?.nodeType===1 ? anchor as Element : anchor?.parentElement)?.closest('td,th');
  const table=cell?.closest('table');if(!cell||!table||!editor.contains(table))return;
  const cells=Array.from(table.querySelectorAll<HTMLElement>('th,td')).filter(item=>item.closest('table')===table);
  const index=cells.indexOf(cell as HTMLElement);let target=cells[index+(event.shiftKey?-1:1)];
  if(!target && !event.shiftKey){
    const body=table.querySelector('tbody') || table.appendChild(document.createElement('tbody'));
    const row=document.createElement('tr');const count=cell.parentElement?.children.length || 1;
    for(let i=0;i<count;i++){const next=document.createElement('td');next.appendChild(document.createElement('br'));row.appendChild(next);}
    body.appendChild(row);target=row.firstElementChild as HTMLElement;onChange();
  }
  if(!target)return;
  event.preventDefault();const range=document.createRange();range.selectNodeContents(target);range.collapse(true);selection?.removeAllRanges();selection?.addRange(range);
}
function placeholderCategory(key:string):'ticket'|'user'|'workspace' {
  if(['WorkspaceName','AppLink','Event'].includes(key))return 'workspace';
  if(['RequesterName','RequesterEmail','CreatorName','AssignedTo','AssignedToEmail','Team','TeamEmail','ChangedBy','UserName','UserEmail','UserRole'].includes(key))return 'user';
  return 'ticket';
}
export function RichTextEditor(props: { value: string; label?: string; required?: boolean; disabled?: boolean; placeholders?:ReadonlyArray<{key:string;label:string}>; plainText?:boolean; footer?:React.ReactNode; onChange: (value: string) => void }): React.ReactElement {
  const host = React.useRef<HTMLDivElement>(null);
  const selection = React.useRef<Range | null>(null);
  const [inserting,setInserting]=React.useState(false);
  const [query,setQuery]=React.useState('');
  const emit = (): void => {
    if(!host.current)return;
    const clone=host.current.cloneNode(true) as HTMLElement;
    clone.querySelectorAll<HTMLElement>('[data-email-token]').forEach(badge=>badge.replaceWith(document.createTextNode('{{'+badge.dataset.emailToken+'}}')));
    const plain=clone.textContent || '';
    props.onChange(props.plainText ? plain.replace(/[\r\n]/g,' ') : plain.trim() ? safeDescriptionHtml(clone.innerHTML) : '');
  };
  const decorate=():void=>{
    if(!props.placeholders || !host.current)return;
    const walker=document.createTreeWalker(host.current,NodeFilter.SHOW_TEXT);const nodes:Text[]=[];
    while(walker.nextNode())nodes.push(walker.currentNode as Text);
    for(const node of nodes){
      if(node.parentElement?.closest('[data-email-token]'))continue;
      const parts=(node.textContent || '').split(/({{\w+}})/g);if(parts.length===1)continue;
      const fragment=document.createDocumentFragment();
      for(const part of parts){const match=/^{{(\w+)}}$/.exec(part);if(!match){fragment.append(part);continue;}
        const badge=document.createElement('span');badge.dataset.emailToken=match[1];badge.dataset.placeholderCategory=placeholderCategory(match[1]);badge.contentEditable='false';badge.className=styles.emailPlaceholderBadge;
        badge.textContent=props.placeholders.find(token=>token.key===match[1])?.label || match[1].replace(/([a-z])([A-Z])/g,'$1 $2');badge.title=part;
        const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.dataset.removePlaceholder='true';remove.setAttribute('aria-label','Remove '+badge.textContent+' placeholder');remove.title='Remove placeholder';remove.disabled=Boolean(props.disabled);
        remove.onmousedown=event=>{event.preventDefault();event.stopPropagation();};
        remove.onclick=event=>{event.preventDefault();event.stopPropagation();if(host.current?.getAttribute('aria-disabled')==='true')return;badge.remove();selection.current=null;emit();host.current?.focus();};
        badge.append(remove);fragment.append(badge);
      }
      node.replaceWith(fragment);
    }
  };
  React.useEffect(() => {
    if (host.current && document.activeElement !== host.current) {
      if (props.plainText) host.current.textContent=props.value;
      else if (/<\/?(?:table|p|div|br|strong|b|em|ul|ol|h[234])\b/i.test(props.value)) host.current.innerHTML = safeDescriptionHtml(props.value);
      else host.current.textContent = decodeHtmlEntities(props.value);
      decorate();
    }
    host.current?.querySelectorAll<HTMLButtonElement>('[data-remove-placeholder]').forEach(button=>{button.disabled=Boolean(props.disabled);});
  }, [props.value,props.disabled]);
  const remember = (): void => { const current = window.getSelection(); if (current?.rangeCount && host.current?.contains(current.anchorNode)) selection.current = current.getRangeAt(0).cloneRange(); };
  const command = (name: string, value?: string): void => {
    if(props.disabled)return;
    host.current?.focus();
    if (selection.current) { const current = window.getSelection(); current?.removeAllRanges(); current?.addRange(selection.current); }
    document.execCommand(name, false, value); remember(); emit();
  };
  return <div><Label required={props.required}>{props.label || 'Description'}</Label><div className={styles.markdownEditor}>
    {!props.plainText && <div className={styles.markdownToolbar} role="toolbar" aria-label="Description formatting">
      <Dropdown ariaLabel="Text style" disabled={props.disabled} defaultSelectedKey="p" options={[{ key: 'p', text: 'Normal Text' }, { key: 'h2', text: 'Heading' }, { key: 'h3', text: 'Subheading' }]} styles={{ root: { width: 140 } }} onChange={(_, option) => command('formatBlock', String(option?.key || 'p'))} />
      {[['Bold', 'bold'], ['Italic', 'italic'], ['Underline', 'underline'], ['Strikethrough', 'strikeThrough'], ['BulletedList', 'insertUnorderedList'], ['NumberedList', 'insertOrderedList'], ['AlignLeft', 'justifyLeft'], ['AlignCenter', 'justifyCenter'], ['ClearFormatting', 'removeFormat']].map(([icon, action]) => <IconButton key={action} iconProps={{ iconName: icon }} ariaLabel={icon} title={icon} disabled={props.disabled} onMouseDown={event => event.preventDefault()} onClick={() => command(action)} />)}
      <TablePickerButton disabled={props.disabled} onInsert={html=>command('insertHTML',html)} />
      <IconButton iconProps={{ iconName: 'Link' }} ariaLabel="Insert link" title="Insert link" disabled={props.disabled} onMouseDown={event => event.preventDefault()} onClick={() => { const url = window.prompt('Link URL (https://...)'); if (url && /^https?:\/\//i.test(url)) command('createLink', url); }} />
    </div>}
    <div data-table-editor-surface="true"><div ref={host} className={styles.richTextInput} style={props.plainText ? {minHeight:36,padding:'8px 10px'} : undefined} contentEditable={!props.disabled} suppressContentEditableWarning role="textbox" aria-label={props.label || 'Description'} aria-multiline={!props.plainText} aria-required={props.required} aria-disabled={props.disabled} tabIndex={0} onInput={emit} onKeyUp={remember} onMouseUp={remember} onBlur={remember} onKeyDown={event=>{if(!props.disabled && !props.plainText && host.current){handleTableTab(event,host.current,emit);remember();}if(props.plainText && event.key==='Enter' && event.target===event.currentTarget)event.preventDefault();}}
      onPaste={event => { event.preventDefault();const html=event.clipboardData.getData('text/html');if(!props.plainText && html)command('insertHTML',safeDescriptionHtml(html));else command('insertText', event.clipboardData.getData('text/plain')); }} /><TableBorderControls editor={host} disabled={props.disabled || props.plainText} onChange={emit} onSelection={remember} /></div>
    {props.placeholders && <div className={styles.emailPlaceholderTools}>
      <DefaultButton styles={{rootHovered:{background:'var(--dp-bg-f0f2f5, #f0f2f5)',color:'var(--dp-fg-172536, #172536)'},rootPressed:{background:'var(--dp-bg-f0f2f5, #f0f2f5)',color:'var(--dp-fg-172536, #172536)'},rootExpanded:{background:'var(--dp-bg-f0f2f5, #f0f2f5)',color:'var(--dp-fg-172536, #172536)'},rootFocused:{outline:'2px solid var(--dp-fg-006bff, #006bff)',outlineOffset:'2px'},rootDisabled:{background:'var(--dp-bg-f7faff, #f7faff)',color:'var(--dp-fg-526783, #526783)',opacity:.6},label:{color:'inherit'},icon:{color:'inherit'},menuIcon:{color:'inherit'}}} className={styles.emailPlaceholderInsert} text="Insert Placeholder" iconProps={{iconName:'Tag'}} menuIconProps={{iconName:inserting ? 'ChevronUp' : 'ChevronDown'}} disabled={props.disabled} aria-expanded={inserting} onClick={()=>{setInserting(!inserting);setQuery('');}} />
      {inserting && <div><SearchBox ariaLabel="Search placeholders" placeholder="Find ticket information" value={query} onChange={(_,value)=>setQuery(value || '')} />
        <div className={styles.emailPlaceholderOptions}>{props.placeholders.filter(token=>(token.label+' '+token.key).toLowerCase().includes(query.toLowerCase())).map(token=><button type="button" key={token.key} data-placeholder-category={placeholderCategory(token.key)} disabled={props.disabled} onClick={()=>{
          const editor=host.current;if(!editor)return;editor.focus();const range=selection.current && editor.contains(selection.current.startContainer) ? selection.current : document.createRange();
          if(!selection.current || !editor.contains(range.startContainer)){range.selectNodeContents(editor);range.collapse(false);}
          range.deleteContents();const node=document.createTextNode('{{'+token.key+'}}');range.insertNode(node);range.setStartAfter(node);range.collapse(true);const current=window.getSelection();current?.removeAllRanges();current?.addRange(range);emit();decorate();selection.current=null;setInserting(false);
        }}>{token.label}</button>)}</div></div>}
    </div>}
    {props.footer}
  </div></div>;
}
