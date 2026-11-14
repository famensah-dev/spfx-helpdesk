import * as React from 'react';
import { DefaultButton, MessageBar, MessageBarType, SearchBox, Spinner } from '@fluentui/react';
import type { ITicketDataSource, IOrganizationGroup } from '../interfaces/ITicketDataSource';
import styles from './HelpdeskSystem.module.scss';

/** Directory lookup is read-only. Laravel remains responsible for saving and authorizing mappings. */
export function DepartmentGroupPicker(props:{service:ITicketDataSource;ids:string[];onChange:(ids:string[])=>void;disabled?:boolean;readOnly?:boolean}):React.ReactElement {
  const [query,setQuery]=React.useState('');
  const [results,setResults]=React.useState<IOrganizationGroup[]>([]);
  const [names,setNames]=React.useState<Record<string,IOrganizationGroup>>({});
  const [loading,setLoading]=React.useState(false);
  const [error,setError]=React.useState('');
  const [lookupNotice,setLookupNotice]=React.useState('');
  const idsKey=props.ids.join(',');
  React.useEffect(()=>{
    let active=true;
    if(!props.service.getDirectoryGroup)return;
    Promise.all(props.ids.map(async id=>{try{return await props.service.getDirectoryGroup!(id);}catch{return undefined;}})).then(groups=>{
      if(!active)return;
      setNames(previous=>({...previous,...Object.fromEntries(groups.filter((group):group is IOrganizationGroup=>Boolean(group)).map(group=>[group.id.toLowerCase(),group]))}));
      setLookupNotice(groups.some(group=>!group)?'Some linked group names could not be loaded. Their existing mappings are preserved.':'');
    }).catch(()=>undefined);
    return ()=>{active=false;};
  },[props.service,idsKey]);
  React.useEffect(()=>{
    let active=true;
    setResults([]);setError('');setLoading(false);
    if(query.trim().length<2 || props.disabled || props.readOnly)return;
    setLoading(true);
    const timer=window.setTimeout(()=>{
      setLoading(true);
      if(!props.service.searchDirectoryGroups){setLoading(false);return;}
      props.service.searchDirectoryGroups(query).then(groups=>{if(active)setResults(groups);}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:String(reason));}).finally(()=>{if(active)setLoading(false);});
    },300);
    return ()=>{active=false;window.clearTimeout(timer);};
  },[query,props.service,props.disabled,props.readOnly]);
  return <div>
    <p>Link Microsoft Entra groups to this department. Group members receive department membership; their application roles are managed separately.</p>
    {!props.readOnly && <SearchBox ariaLabel="Search tenant groups" placeholder="Search groups by name or email" value={query} disabled={props.disabled || !props.service.searchDirectoryGroups} onChange={(_,value)=>setQuery(value || '')} />}
    {!props.service.searchDirectoryGroups && !props.readOnly && <MessageBar>Tenant group search is unavailable for this connection.</MessageBar>}
    {loading && <Spinner label="Searching tenant groups" />}
    {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {lookupNotice && <MessageBar>{lookupNotice}</MessageBar>}
    {!loading && query.trim().length>=2 && !error && !results.length && <p role="status">No matching groups.</p>}
    <ul className={styles.helpdeskUserResults} aria-label="Tenant group search results">{results.filter(group=>!props.ids.includes(group.id.toLowerCase())).map(group=><li key={group.id}><DefaultButton text={group.displayName} ariaLabel={`Select group ${group.displayName}`} disabled={props.disabled} onClick={()=>{const id=group.id.toLowerCase();setNames(previous=>({...previous,[id]:group}));props.onChange([...props.ids,id]);}} />{group.mail && <small>{group.mail}</small>}</li>)}</ul>
    <h4>Linked groups ({props.ids.length})</h4>
    <ul className={styles.helpdeskUserResults} aria-label="Linked tenant groups">{props.ids.map(id=><li key={id}><span>{names[id]?.displayName || id}</span>{!props.readOnly && <DefaultButton text="Remove" ariaLabel={`Remove group ${names[id]?.displayName || id}`} disabled={props.disabled} onClick={()=>props.onChange(props.ids.filter(value=>value!==id))} />}</li>)}</ul>
    {!props.ids.length && <p>No groups linked yet.</p>}
  </div>;
}
