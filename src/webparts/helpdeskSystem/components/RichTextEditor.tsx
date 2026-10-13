import * as React from 'react';
import { IconButton, Label, Dropdown } from '@fluentui/react';
import styles from './HelpdeskSystem.module.scss';

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
export function RichTextEditor(props: { value: string; disabled?: boolean; onChange: (value: string) => void }): React.ReactElement {
  const host = React.useRef<HTMLDivElement>(null);
  const selection = React.useRef<Range | null>(null);
  React.useEffect(() => {
    if (host.current && document.activeElement !== host.current) {
      if (/<\/?(?:p|div|br|strong|b|em|ul|ol|h[234])\b/i.test(props.value)) host.current.innerHTML = safeDescriptionHtml(props.value);
      else host.current.textContent = props.value;
    }
  }, [props.value]);
  const remember = (): void => { const current = window.getSelection(); if (current?.rangeCount && host.current?.contains(current.anchorNode)) selection.current = current.getRangeAt(0).cloneRange(); };
  const emit = (): void => { if (host.current) props.onChange(host.current.innerText.trim() ? safeDescriptionHtml(host.current.innerHTML) : ''); };
  const command = (name: string, value?: string): void => {
    host.current?.focus();
    if (selection.current) { const current = window.getSelection(); current?.removeAllRanges(); current?.addRange(selection.current); }
    document.execCommand(name, false, value); remember(); emit();
  };
  return <div><Label>Issue description</Label><div className={styles.markdownEditor}>
    <div className={styles.markdownToolbar} role="toolbar" aria-label="Description formatting">
      <Dropdown ariaLabel="Text style" disabled={props.disabled} defaultSelectedKey="p" options={[{ key: 'p', text: 'Normal text' }, { key: 'h2', text: 'Heading' }, { key: 'h3', text: 'Subheading' }]} styles={{ root: { width: 140 } }} onChange={(_, option) => command('formatBlock', String(option?.key || 'p'))} />
      {[['Bold', 'bold'], ['Italic', 'italic'], ['Underline', 'underline'], ['Strikethrough', 'strikeThrough'], ['BulletedList', 'insertUnorderedList'], ['NumberedList', 'insertOrderedList'], ['AlignLeft', 'justifyLeft'], ['AlignCenter', 'justifyCenter'], ['ClearFormatting', 'removeFormat']].map(([icon, action]) => <IconButton key={action} iconProps={{ iconName: icon }} ariaLabel={icon} title={icon} disabled={props.disabled} onMouseDown={event => event.preventDefault()} onClick={() => command(action)} />)}
      <IconButton iconProps={{ iconName: 'Link' }} ariaLabel="Insert link" title="Insert link" disabled={props.disabled} onMouseDown={event => event.preventDefault()} onClick={() => { const url = window.prompt('Link URL (https://...)'); if (url && /^https?:\/\//i.test(url)) command('createLink', url); }} />
    </div>
    <div ref={host} className={styles.richTextInput} contentEditable={!props.disabled} suppressContentEditableWarning role="textbox" aria-label="Issue description" aria-multiline="true" aria-disabled={props.disabled} tabIndex={0} onInput={emit} onKeyUp={remember} onMouseUp={remember} onBlur={remember}
      onPaste={event => { event.preventDefault(); command('insertText', event.clipboardData.getData('text/plain')); }} />
  </div></div>;
}
