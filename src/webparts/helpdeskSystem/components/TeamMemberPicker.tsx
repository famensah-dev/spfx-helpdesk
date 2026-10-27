import * as React from 'react';
import { Checkbox, MessageBar, MessageBarType, PersonaCoin, SearchBox, Spinner } from '@fluentui/react';
import type { IOrganizationUser, ITicketDataSource } from '../interfaces/ITicketDataSource';
import styles from './HelpdeskSystem.module.scss';
const identity=(user:IOrganizationUser):string=>(user.userPrincipalName||user.email||user.id).toLowerCase();
export function TeamMemberPicker({service,users,onChange,disabled,existingUserIds=[]}:{service:ITicketDataSource;users:IOrganizationUser[];onChange:(users:IOrganizationUser[])=>void;disabled:boolean;existingUserIds?:number[]}):React.ReactElement {
  const [roster,setRoster]=React.useState<IOrganizationUser[]>([]);
  const [results,setResults]=React.useState<IOrganizationUser[]>([]);
  const [query,setQuery]=React.useState('');
  const [loading,setLoading]=React.useState(true),[searching,setSearching]=React.useState(false);
  const [rosterError,setRosterError]=React.useState(''),[searchError,setSearchError]=React.useState('');
  React.useEffect(()=>{
    let active=true;setLoading(true);setRosterError('');
    (service.getTeamCandidates?service.getTeamCandidates():Promise.resolve([])).then(value=>{if(active)setRoster(value);}).catch(reason=>{if(active)setRosterError((reason instanceof Error?reason.message:'Unable to load DeskPilot users.')+' You can still search the organization.');}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[service]);
  React.useEffect(()=>{
    let active=true;setResults([]);setSearchError('');setSearching(false);
    if(query.trim().length<2 || !service.searchUsers)return;
    setSearching(true);
    const timer=window.setTimeout(()=>{
      service.searchUsers!(query.trim()).then(value=>{if(active)setResults(value);}).catch(reason=>{if(active)setSearchError(reason instanceof Error?reason.message:'Unable to search users.');}).finally(()=>{if(active)setSearching(false);});
    },300);
    return()=>{active=false;window.clearTimeout(timer);};
  },[query,service]);
  const candidates=new Map<string,IOrganizationUser>();
  // Prefer the roster identity so directory matches retain SharePoint membership information.
  for(const user of [...results,...users,...roster])candidates.set(identity(user),user);
  const term=query.trim().toLowerCase();
  const visible=[...candidates.values()].filter(user=>!term||(user.displayName+' '+user.email+' '+user.userPrincipalName).toLowerCase().includes(term)).sort((a,b)=>a.displayName.localeCompare(b.displayName));
  return <div className={styles.teamMemberPicker}>
    <SearchBox ariaLabel="Search team candidates" placeholder="Search DeskPilot or organization users" value={query} disabled={disabled} onChange={(_,value)=>setQuery(value||'')} />
    <div className={styles.teamMemberPickerHeading}><span>{term?'Matching users':'DeskPilot agents & helpdesk admins'}</span><span>{users.length} selected</span></div>
    {loading&&<Spinner label="Loading DeskPilot users..." />}
    {searching&&<Spinner label="Searching organization..." />}
    {rosterError&&<MessageBar messageBarType={MessageBarType.warning}>{rosterError}</MessageBar>}
    {searchError&&<MessageBar messageBarType={MessageBarType.error}>{searchError}</MessageBar>}
    <div className={styles.teamMemberChecklist}>{visible.map(user=>{
      const existing=Boolean(user.sharePointId&&existingUserIds.includes(user.sharePointId));
      const checked=users.some(selected=>identity(selected)===identity(user));
      return <div className={styles.teamMemberCandidate} key={identity(user)}>
        <Checkbox ariaLabel={'Select '+user.displayName} checked={existing||checked} disabled={disabled||existing} onChange={(_,value)=>onChange(value?[...users,user]:users.filter(selected=>identity(selected)!==identity(user)))} />
        <PersonaCoin text={user.displayName} coinSize={28} />
        <span><strong>{user.displayName}</strong><small>{user.email}</small></span>{existing&&<small>Already in team</small>}
      </div>;
    })}</div>
    {!loading&&!searching&&!visible.length&&<p>{term?'No matching users.':'No DeskPilot users available. Search the organization to add someone else.'}</p>}
  </div>;
}
