import * as React from 'react';
import { Checkbox, PersonaCoin, DefaultButton, Dialog, Dropdown, Icon, IconButton, MessageBar, MessageBarType, PrimaryButton, SearchBox, Spinner, TextField } from '@fluentui/react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import type { ISupportUnitData, ISupportUnit, IUnitMember } from '../interfaces/ISupportUnits';
import { FormAssigneePicker } from '../components/FormAssigneePicker';
import { MissingWorkspaceNotice } from '../components/WorkspaceSetupPanel';
import { cancelButtonStyles } from '../components/cancelButtonStyles';
import styles from '../components/HelpdeskSystem.module.scss';
export function SupportUnitsPage({service}:{service:ITicketDataSource}):React.ReactElement {
  const [data,setData] = React.useState<ISupportUnitData>();
  const [selected,setSelected] = React.useState(0);
  const [draft,setDraft] = React.useState<ISupportUnit>();
  const [member,setMember] = React.useState<IUnitMember>();
  const [busy,setBusy] = React.useState(false);
  const [personBusy,setPersonBusy] = React.useState(false);
  const [error,setError] = React.useState('');
  const [message,setMessage] = React.useState('');
  const [tab,setTab] = React.useState<'members'|'assignment'>('members');
  const [search,setSearch] = React.useState('');
  const [creating,setCreating] = React.useState(false);
  const [newName,setNewName] = React.useState('');
  const lock = React.useRef(false);
  const preserveDraft = React.useRef(false);
  const api = service.supportUnits;
  React.useEffect(()=>{let active=true;setBusy(true);api?.load().then(result=>{if(active){setData(result);setSelected(0);}}).catch(reason=>{if(active)setError(reason instanceof Error ? reason.message : 'Unable to load support teams.');}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[api]);
  React.useEffect(()=>{if(preserveDraft.current){preserveDraft.current=false;return;}setDraft(data?.units.find(unit=>unit.id===selected));},[data,selected]);
  const run = async(action:()=>Promise<string|void>, keepDraft=false):Promise<void>=>{
    if(lock.current || !api)return;lock.current=true;setBusy(true);setError('');setMessage('');
    try{const result=await action();setMember(undefined);setCreating(false);setMessage(result || (member ? 'Member saved.' : 'Changes saved.'));const updated=await api.load();preserveDraft.current=Boolean(member) || keepDraft;setData(updated);if(creating)setSelected(updated.units.find(unit=>unit.title===newName.trim())?.id || 0);}
    catch(reason){setError(reason instanceof Error ? reason.message : 'Unable to save team changes.');}
    finally{lock.current=false;setBusy(false);}
  };
  const createUnits=async():Promise<void>=>{
    if(lock.current || !api)return;lock.current=true;setBusy(true);setError('');setMessage('');
    try{
      const result=await api.createUnits(newName.split(/\r?\n/));
      setData(await api.load());setSelected(0);
      const summary=`Created ${result.created.length} teams.${result.skipped.length ? ` Skipped ${result.skipped.length} existing teams.` : ''}`;
      if(result.failed.length){setNewName(result.failed.map(entry=>entry.name).join('\n'));setError(`${summary} ${result.failed[0].name}: ${result.failed[0].message} Remaining names are kept here; retrying skips units already created.`);}
      else{setCreating(false);setMessage(`${summary} Open a team to configure its assignment settings.`);}
    }catch(reason){setError(reason instanceof Error ? reason.message : 'Team creation could not be confirmed.');}
    finally{lock.current=false;setBusy(false);}
  };
  const unitMembers=(data?.members || []).filter(entry=>entry.unitId===selected).sort((a,b)=>a.order-b.order || a.id-b.id);
  const persisted=data?.units.find(unit=>unit.id===selected);
  const dirty=Boolean(draft && persisted && JSON.stringify(draft)!==JSON.stringify(persisted));
  const leaveDraft=():boolean=>!dirty || window.confirm('Discard unsaved team settings?');
  const choose=(id:number):void=>{if(leaveDraft()){setSelected(id);setTab('members');setError('');setMessage('');}};
  const memberName=(unit:ISupportUnit):string=>data?.members.find(entry=>entry.id===unit.teamLeadMemberId && entry.unitId===unit.id)?.name || 'Choose a member';
  const filteredTeams=(data?.units || []).filter(unit=>(unit.title+' '+(unit.email || '')).toLowerCase().includes(search.toLowerCase()));
  const addMember=():void=>{setError('');setMember({id:0,unitId:selected,userId:0,name:'',available:true,order:unitMembers.reduce((max,entry)=>Math.max(max,entry.order),0)+1});};
  return <div className={[styles.supportUnitsPage,styles.teamsWorkspace].join(' ')}>
    <div className={styles.teamsToolbar}><div>{selected ? <DefaultButton text="All teams" iconProps={{iconName:'Back'}} styles={cancelButtonStyles} disabled={busy} onClick={()=>choose(0)} /> : <h3>Teams</h3>}</div><PrimaryButton text="Create teams" iconProps={{iconName:'Add'}} disabled={busy || !data} onClick={()=>{if(leaveDraft()){setNewName('');setError('');setCreating(true);}}} /></div>
    <MissingWorkspaceNotice service={service} error={error} />
    {error && !member && !creating && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {message && <MessageBar messageBarType={MessageBarType.success} onDismiss={()=>setMessage('')}>{message}</MessageBar>}
    {busy && !data ? <Spinner label="Loading teams..." /> : data && <>
      {!selected ? <div className={styles.teamsOverview}>
        <div className={styles.teamsToolbar}><SearchBox ariaLabel="Search teams" placeholder="Search teams" value={search} onChange={(_,value)=>setSearch(value || '')} /><span>{data.units.length} teams</span></div>
        {data.units.length ? <div className={styles.tableContainer}><table className={styles.ticketTable}><thead><tr><th>Team</th><th>Email address</th><th>Members</th><th>Team lead</th><th>Assignment</th><th>Status</th><th /></tr></thead><tbody>{filteredTeams.map(unit=><tr key={unit.id}><td><button type="button" className={styles.ticketSubjectLink} disabled={busy} onClick={()=>choose(unit.id)}>{unit.title}</button></td><td>{unit.email ? <a href={'mailto:'+unit.email}>{unit.email}</a> : 'Not set'}</td><td>{data.members.filter(entry=>entry.unitId===unit.id).length}</td><td>{unit.teamLeadMemberId ? memberName(unit) : 'Not selected'}</td><td>{unit.method}</td><td><span className={styles.teamStatus} data-active={unit.active}>{unit.active ? 'Active' : 'Inactive'}</span></td><td><IconButton iconProps={{iconName:'ChevronRight'}} ariaLabel={'Open '+unit.title} disabled={busy} styles={cancelButtonStyles} onClick={()=>choose(unit.id)} /></td></tr>)}</tbody></table></div> : <div className={styles.supportUnitEmpty}><Icon iconName="People" /><h3>No teams yet</h3><p>Create teams, then add their members and assignment settings.</p></div>}
        {data.units.length>0 && !filteredTeams.length && <p>No teams match your search.</p>}
      </div> : draft ? <div className={styles.teamsEditorLayout}>
        <aside className={styles.teamsSidebar} aria-label="Teams"><SearchBox ariaLabel="Find a team" placeholder="Find a team" value={search} onChange={(_,value)=>setSearch(value || '')} /><nav>{filteredTeams.map(unit=><button type="button" key={unit.id} disabled={busy} aria-current={unit.id===selected ? 'page' : undefined} onClick={()=>choose(unit.id)}><Icon iconName="People" /><span>{unit.title}<small>{data.members.filter(entry=>entry.unitId===unit.id).length} members</small></span></button>)}</nav></aside>
        <div className={styles.teamsEditor}>
          <form onSubmit={event=>{event.preventDefault();void run(()=>api!.saveUnit(draft,draft.id));}}>
            <header className={styles.teamsToolbar}><div><h3>{persisted?.title}</h3><span className={styles.teamStatus} data-active={draft.active}>{draft.active ? 'Active team' : 'Inactive team'}</span></div><div className={styles.teamsButtons}><DefaultButton text="Discard" styles={cancelButtonStyles} disabled={busy || !dirty} onClick={()=>{setDraft(persisted);setError('');}} /><PrimaryButton type="submit" text={busy ? 'Saving...' : 'Save changes'} disabled={busy || !dirty} /></div></header>
            <div className={styles.teamDetailsFields}><TextField label="Team name" required maxLength={255} value={draft.title} disabled={busy} onChange={(_,value)=>setDraft({...draft,title:value || ''})} /><TextField label="Team email" type="email" placeholder="team@company.com" maxLength={254} value={draft.email || ''} disabled={busy} onChange={(_,value)=>setDraft({...draft,email:value || ''})} /><Checkbox label="Active" checked={draft.active} disabled={busy} onChange={(_,checked)=>setDraft({...draft,active:Boolean(checked)})} /></div>
            <nav className={styles.teamEditorTabs} aria-label="Team settings"><button type="button" aria-current={tab==='members' ? 'page' : undefined} onClick={()=>setTab('members')}><Icon iconName="People" />Members ({unitMembers.length})</button><button type="button" aria-current={tab==='assignment' ? 'page' : undefined} onClick={()=>setTab('assignment')}><Icon iconName="Flow" />Assignment ({draft.categoryIds.length} categories)</button></nav>
            {tab==='assignment' && <div className={styles.teamAssignmentFields}>
              <Dropdown label="Ticket categories" placeholder="Select categories" multiSelect selectedKeys={draft.categoryIds} disabled={busy} options={data.categories.map(category=>{const owner=data.units.find(unit=>unit.id!==draft.id && unit.active && unit.categoryIds.includes(category.id));return {key:category.id,text:category.title+(owner ? ' ('+owner.title+')' : ''),disabled:Boolean(owner && !draft.categoryIds.includes(category.id))};})} onChange={(_,option)=>{if(option)setDraft({...draft,categoryIds:option.selected ? [...draft.categoryIds,Number(option.key)] : draft.categoryIds.filter(id=>id!==Number(option.key))});}} />
              <div className={styles.teamDetailsFields}><Dropdown label="Assignment method" selectedKey={draft.method} disabled={busy} options={[{key:'Round robin',text:'Round robin'},{key:'Team lead',text:'Assign to team lead'}]} onChange={(_,option)=>{if(option)setDraft({...draft,method:option.key as ISupportUnit['method']});}} /><Dropdown label="Team lead" placeholder="Select a member" required={draft.method==='Team lead'} selectedKey={draft.teamLeadMemberId || 0} disabled={busy} options={[{key:0,text:'No team lead'},...unitMembers.map(entry=>({key:entry.id,text:entry.name+(entry.available ? '' : ' (unavailable)')}))]} onChange={(_,option)=>setDraft({...draft,teamLeadMemberId:Number(option?.key) || undefined})} /></div>
              <p className={styles.adminHint}>{draft.method==='Round robin' ? 'Tickets rotate through available members in rotation order.' : 'Tickets go to the selected team lead when available.'} Categories are used only when Auto Assignment is enabled.</p>
              {!data.categories.length && <p>Add categories in Helpdesk Settings to configure assignment.</p>}
            </div>}
          </form>
          {tab==='members' && <section className={styles.teamMembers} aria-label="Team members"><div className={styles.teamsToolbar}><h4>Members</h4><DefaultButton text="Add member" iconProps={{iconName:'AddFriend'}} disabled={busy} onClick={addMember} /></div>
            {unitMembers.length ? <div className={styles.tableContainer}><table className={styles.ticketTable}><thead><tr><th>Member</th><th>Role</th><th>Rotation</th><th>Available</th><th /></tr></thead><tbody>{unitMembers.map(entry=><tr key={entry.id}><td><span className={styles.teamMemberName}><PersonaCoin text={entry.name} coinSize={28} /><span>{entry.name}</span></span></td><td>{entry.id===persisted?.teamLeadMemberId ? <span className={styles.teamStatus} data-active="true">Team lead</span> : 'Member'}</td><td>{entry.order}</td><td><Checkbox ariaLabel={'Available for assignment: '+entry.name} checked={entry.available} disabled={busy} onChange={(_,checked)=>{void run(()=>api!.saveMember({...entry,available:Boolean(checked)},entry.id),true);}} /></td><td><div className={styles.teamsButtons}>{entry.id!==persisted?.teamLeadMemberId && <DefaultButton text="Make lead" styles={cancelButtonStyles} disabled={busy} onClick={()=>{void run(async()=>{await api!.setTeamLead(selected,entry.id);setDraft(current=>current ? {...current,teamLeadMemberId:entry.id} : current);},true);}} />}<IconButton iconProps={{iconName:'Edit'}} ariaLabel={'Edit '+entry.name} styles={cancelButtonStyles} disabled={busy} onClick={()=>{setError('');setMember({...entry});}} /></div></td></tr>)}</tbody></table></div> : <div className={styles.teamMembersEmpty}><p>No members yet.</p><DefaultButton text="Add your first member" iconProps={{iconName:'AddFriend'}} disabled={busy} onClick={addMember} /></div>}
          </section>}
        </div>
      </div> : <MessageBar>This team is no longer available.</MessageBar>}
    </>}
    <Dialog hidden={!creating && !member} onDismiss={busy || personBusy ? undefined : ()=>{setCreating(false);setMember(undefined);setError('');}} dialogContentProps={{title:creating ? 'Create teams' : member?.id ? 'Edit member' : 'Add team member',showCloseButton:!busy && !personBusy}} modalProps={{isBlocking:true}} minWidth={440}>
      {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
      <form className={styles.adminFormFields} onSubmit={event=>{event.preventDefault();if(personBusy)return;if(creating)void createUnits();else if(member)void run(()=>api!.saveMember(member,member.id || undefined));}}>
        {creating ? <><TextField label="Team names" required multiline rows={6} description="Enter one team name per line. Existing teams will be skipped." placeholder={'Infrastructure\nApplications\nService Desk'} value={newName} disabled={busy} onChange={(_,value)=>setNewName(value || '')} /><p>Open each team after creation to add members, select categories and choose its assignment method.</p></> : member && <><FormAssigneePicker label="Member" service={service} value={member.userId ? {Id:member.userId,Title:member.name} : null} disabled={busy} onBusy={setPersonBusy} onChange={person=>setMember({...member,userId:person?.Id || 0,name:person?.Title || person?.Email || ''})} /><TextField label="Rotation order" type="number" min={0} step={1} value={String(member.order)} disabled={busy} onChange={(_,value)=>setMember({...member,order:Number(value)})} /><Checkbox label="Available for assignment" checked={member.available} disabled={busy} onChange={(_,checked)=>setMember({...member,available:Boolean(checked)})} /><p>Choose an existing DeskPilot agent or Helpdesk Admin.</p></>}
        <div className={styles.faqModalFooter}><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy || personBusy} onClick={()=>{setCreating(false);setMember(undefined);setError('');}} /><PrimaryButton type="submit" text={busy ? 'Saving...' : creating ? 'Create teams' : 'Save member'} disabled={busy || personBusy} /></div>
      </form>
    </Dialog>
  </div>;
}
