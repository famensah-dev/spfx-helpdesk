import * as React from 'react';
import { DefaultButton, IconButton, PrimaryButton } from '@fluentui/react';
import { AttachmentPicker } from './AttachmentFiles';
import { safeDescriptionHtml } from './RichTextEditor';
import styles from './HelpdeskSystem.module.scss';

export function CommentComposer(props:{value:string;disabled:boolean;posting:boolean;retry:boolean;canAttach:boolean;canPost:boolean;files:File[];onFiles:(files:File[])=>void;onChange:(text:string,html:string)=>void}):React.ReactElement {
  const [active,setActive]=React.useState(false);
  const editor=React.useRef<HTMLDivElement>(null);
  const root=React.useRef<HTMLDivElement>(null);
  const selection=React.useRef<Range>();
  React.useEffect(()=>{if(!props.value && editor.current){editor.current.innerHTML='';if(!props.posting)setActive(false);}},[props.value,props.posting]);
  const remember=():void=>{const current=window.getSelection();if(current?.rangeCount && editor.current?.contains(current.anchorNode))selection.current=current.getRangeAt(0).cloneRange();};
  const emit=():void=>{if(!editor.current)return;const text=editor.current.innerText || editor.current.textContent || '';props.onChange(text.trim() ? text : '',text.trim() ? safeDescriptionHtml(editor.current.innerHTML) : '');};
  const command=(name:string,value?:string):void=>{if(props.disabled)return;editor.current?.focus();if(selection.current){const current=window.getSelection();current?.removeAllRanges();current?.addRange(selection.current);}document.execCommand(name,false,value);remember();emit();};
  return <div ref={root} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node) && !props.value && !props.files.length)setActive(false);}} className={styles.focusCommentComposer} data-active={active || !!props.value || !!props.files.length}>
    {(active || !!props.value || !!props.files.length) && <div className={styles.focusCommentToolbar} role="toolbar" aria-label="Comment formatting">{[['Bold','bold'],['Italic','italic'],['Underline','underline'],['BulletedList','insertUnorderedList'],['NumberedList','insertOrderedList']].map(([icon,action])=><IconButton key={action} iconProps={{iconName:icon}} ariaLabel={icon} title={icon} disabled={props.disabled} onMouseDown={event=>event.preventDefault()} onClick={()=>command(action)} />)}<IconButton iconProps={{iconName:'Link'}} ariaLabel="Insert link" title="Insert link" disabled={props.disabled} onMouseDown={event=>event.preventDefault()} onClick={()=>{const url=window.prompt('Link URL (https://...)');if(url && /^https?:\/\//i.test(url))command('createLink',url);}} /></div>}
    <div ref={editor} className={styles.focusCommentInput} contentEditable={!props.disabled} suppressContentEditableWarning role="textbox" aria-label="Comment" aria-multiline="true" aria-disabled={props.disabled} data-placeholder="Add a comment..." tabIndex={0} onFocus={()=>setActive(true)} onInput={emit} onKeyUp={remember} onMouseUp={remember} onBlur={remember} onPaste={event=>{event.preventDefault();command('insertText',event.clipboardData.getData('text/plain'));}} />
    <div className={styles.focusCommentFiles}><AttachmentPicker compact chips files={props.files} onChange={props.onFiles} disabled={!props.canAttach || props.posting} /></div>
    {(active || !!props.value || !!props.files.length) && <div className={styles.focusCommentFooter}><DefaultButton text="Attach files" iconProps={{iconName:'Attach'}} disabled={!props.canAttach || props.posting} onClick={()=>root.current?.querySelector<HTMLInputElement>('input[type="file"]')?.click()} /><span /><DefaultButton text="Cancel" disabled={props.posting || props.retry} onClick={()=>{props.onChange('','');props.onFiles([]);if(editor.current)editor.current.innerHTML='';setActive(false);}} /><PrimaryButton type="submit" text={props.posting ? 'Posting...' : props.retry ? 'Retry attachments' : 'Post'} disabled={!props.canPost} /></div>}
  </div>;
}
