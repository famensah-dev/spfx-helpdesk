import * as React from 'react';
import { ComboBox, DirectionalHint } from '@fluentui/react';
import type { IComboBox } from '@fluentui/react';

export function SearchableSelect(props: { label: string; required?: boolean; disabled?: boolean; value: string; placeholder?: string; options: Array<{ key: string; text: string }>; onChange: (value: string) => void }): React.ReactElement {
  const [query, setQuery] = React.useState<string | null>(null);
  const combo = React.useRef<IComboBox>(null);
  const filtered = props.options.filter(option => !query || option.text.toLowerCase().includes(query.toLowerCase()));
  return <ComboBox componentRef={combo} label={props.label} required={props.required} disabled={props.disabled} selectedKey={props.value}
    onFocus={event => { if (event.target instanceof HTMLElement && event.target.tagName === 'INPUT') combo.current?.focus(true); }}
    onClick={event => { if (event.target instanceof HTMLElement && event.target.tagName === 'INPUT') combo.current?.focus(true); }}
    text={query === null ? props.options.find(option => option.key === props.value)?.text || '' : query}
    placeholder={props.placeholder || 'Search or select an option'} allowFreeform autoComplete="off"
    options={filtered.length ? filtered : [{ key: '__no_results__', text: 'No matching options', disabled: true }]}
    onInputValueChange={value => { setQuery(value); combo.current?.focus(true); }} onMenuDismissed={() => setQuery(null)}
    onBlur={() => setQuery(null)} onChange={(_, option) => { if (option && !option.disabled) { props.onChange(String(option.key)); setQuery(null); } }}
    onRenderOption={option => <span style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{option?.text}</span>}
    dropdownWidth={Math.min(420, window.innerWidth - 32)}
    calloutProps={{ calloutMaxHeight: 280, directionalHint: DirectionalHint.bottomLeftEdge, gapSpace: 4 }}
    styles={{ root: { width: '100%', borderRadius: 4, selectors: { ':after': { border: '1px solid #d6e1ee', borderRadius: 4 }, '&.is-open:after': { border: '1px solid #789ac4', borderRadius: 4 } } }, input: { fontSize: 13, color: '#293d58' }, rootHovered: { selectors: { ':after': { border: '1px solid #a9bfd9' } } }, rootFocused: { selectors: { ':after': { border: '1px solid #789ac4', borderRadius: 4 } } }, optionsContainerWrapper: { maxHeight: 280 } }} />;
}
