import * as React from 'react';
import { Callout, DefaultButton, Persona, PersonaSize } from '@fluentui/react';
import type { IUserLookup } from '../interfaces/ITicket';
import { cancelButtonStyles } from './cancelButtonStyles';
export function PersonContact({person,siteUrl}:{person?:IUserLookup;siteUrl?:string}): React.ReactElement {
  const [open,setOpen] = React.useState(false);
  const anchor = React.useRef<HTMLDivElement>(null);
  if (!person) return <span>Not available</span>;
  const email = person.Email;
  const photo = email && siteUrl ? `${siteUrl}/_layouts/15/userphoto.aspx?size=S&accountname=${encodeURIComponent(email)}` : undefined;
  return <div ref={anchor}><DefaultButton styles={cancelButtonStyles} onClick={() => setOpen(value => !value)} ariaLabel={`Contact ${person.Title || email || 'creator'}`}><Persona text={person.Title || email || 'Creator'} imageUrl={photo} size={PersonaSize.size32} /></DefaultButton>{open && <Callout target={anchor} onDismiss={() => setOpen(false)} setInitialFocus role="dialog" ariaLabel="Creator contact details"><div style={{padding:20,minWidth:240}}><Persona text={person.Title || email} secondaryText={email} imageUrl={photo} size={PersonaSize.size48} /><div style={{display:'flex',gap:16,marginTop:16}}>{email ? <><a href={`mailto:${encodeURIComponent(email)}`}>Email</a><a href={`https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(email)}`} target="_blank" rel="noopener noreferrer">Teams chat</a></> : <span>Contact address is unavailable.</span>}</div></div></Callout>}</div>;
}
