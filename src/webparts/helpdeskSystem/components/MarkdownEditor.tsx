import * as React from 'react';
import { DefaultButton, IconButton, Label } from '@fluentui/react';
import styles from './HelpdeskSystem.module.scss';

function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).map((part, index) => {
    if (part.startsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link && /^(https?:\/\/|mailto:)/i.test(link[2])) return <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    return part;
  });
}
export function MarkdownContent(props: { value: string }): React.ReactElement {
  const lines = props.value.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const code: string[] = [];
      while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i]);
      blocks.push(<pre key={i}><code>{code.join('\n')}</code></pre>);
    } else if (/^#{1,3} /.test(line)) {
      const level = line.match(/^#+/)![0].length;
      const content = inline(line.replace(/^#+ /, ''));
      blocks.push(level === 1 ? <h3 key={i}>{content}</h3> : level === 2 ? <h4 key={i}>{content}</h4> : <h5 key={i}>{content}</h5>);
    } else if (/^([-*] |\d+\. )/.test(line)) {
      const ordered = /^\d+\./.test(line);
      const items: React.ReactNode[] = [];
      const pattern = ordered ? /^\d+\. / : /^[-*] /;
      while (i < lines.length && pattern.test(lines[i])) { items.push(<li key={i}>{inline(lines[i].replace(pattern, ''))}</li>); i++; }
      i--;
      blocks.push(ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>);
    } else if (line.startsWith('> ')) blocks.push(<blockquote key={i}>{inline(line.slice(2))}</blockquote>);
    else if (line.trim()) blocks.push(<p key={i}>{inline(line)}</p>);
  }
  return <div className={styles.markdownContent}>{blocks}</div>;
}
export function MarkdownEditor(props: { value: string; disabled?: boolean; onChange: (value: string) => void }): React.ReactElement {
  const [preview, setPreview] = React.useState(false);
  const input = React.useRef<HTMLTextAreaElement>(null);
  const insert = (before: string, after = '', placeholder = 'text'): void => {
    const editor = input.current;
    if (!editor) return;
    const start = editor.selectionStart, end = editor.selectionEnd;
    const selected = props.value.slice(start, end) || placeholder;
    props.onChange(props.value.slice(0, start) + before + selected + after + props.value.slice(end));
    window.requestAnimationFrame(() => { editor.focus(); editor.setSelectionRange(start + before.length, start + before.length + selected.length); });
  };
  return <div><Label htmlFor="ticket-markdown-description">Issue description</Label><div className={styles.markdownEditor}>
    <div className={styles.markdownToolbar} role="toolbar" aria-label="Description formatting">
      {[{ name: 'Bold', before: '**', after: '**' }, { name: 'Italic', before: '*', after: '*' }, { name: 'Header1', label: 'Heading', before: '\n## ' }, { name: 'BulletedList', label: 'Bulleted list', before: '\n- ' }, { name: 'NumberedList', label: 'Numbered list', before: '\n1. ' }, { name: 'Code', before: '`', after: '`' }, { name: 'Link', before: '[', after: '](https://example.com)' }].map(item => <IconButton key={item.name} iconProps={{ iconName: item.name }} title={item.label || item.name} ariaLabel={item.label || item.name} disabled={props.disabled || preview} onClick={() => insert(item.before, item.after)} />)}
      <DefaultButton text={preview ? 'Edit' : 'Preview'} aria-pressed={preview} disabled={props.disabled} onClick={() => setPreview(value => !value)} />
    </div>
    {preview ? <div className={styles.markdownPreview}>{props.value ? <MarkdownContent value={props.value} /> : <p>Nothing to preview yet.</p>}</div> : <textarea id="ticket-markdown-description" ref={input} rows={8} value={props.value} disabled={props.disabled} onChange={event => props.onChange(event.target.value)} placeholder="Describe the issue. Markdown formatting is supported." />}
  </div><small className={styles.markdownHint}>Markdown: **bold**, *italic*, lists, links, and `code`.</small></div>;
}
