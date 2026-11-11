import { TeamMemberPicker } from '../components/TeamMemberPicker';
import type { IOrganizationUser } from '../interfaces/ITicketDataSource';
import * as React from 'react';
import { Checkbox, PersonaCoin, DefaultButton, Dialog, Dropdown, Icon, IconButton, MessageBar, MessageBarType, PrimaryButton, SearchBox, Spinner, TextField } from '@fluentui/react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import type { ISupportUnitData, ISupportUnit, IUnitMember } from '../interfaces/ISupportUnits';
import { FormAssigneePicker } from '../components/FormAssigneePicker';
import { MissingWorkspaceNotice } from '../components/WorkspaceSetupPanel';
import { cancelButtonStyles } from '../components/cancelButtonStyles';
import styles from '../components/HelpdeskSystem.module.scss';
export function SupportUnitsPage({service, hideHeading=false}:{service:ITicketDataSource;hideHeading?:boolean}):React.ReactElement {
  const [data,setData] = React.useState<ISupportUnitData>();
  const [selected,setSelected] = React.useState(0);
  const [draft,setDraft] = React.useState<ISupportUnit>();
  const [pendingUsers,setPendingUsers] = React.useState<IOrganizationUser[]>([]);
  const [member,setMember] = React.useState<IUnitMember>();
  const [busy,setBusy] = React.useState(false);
  const [personBusy,setPersonBusy] = React.useState(false);
  const [error,setError] = React.useState('');
  const [message,setMessage] = React.useState('');

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
  const choose=(id:number):void=>{if(leaveDraft()){setSelected(id);setError('');setMessage('');}};
  const memberName=(unit:ISupportUnit):string=>data?.members.find(entry=>entry.id===unit.teamLeadMemberId && entry.unitId===unit.id)?.name || 'Choose a member';
  const filteredTeams=(data?.units || []).filter(unit=>(unit.title+' '+(unit.email || '')).toLowerCase().includes(search.toLowerCase()));
  const addMember=():void=>{setPendingUsers([]);setError('');setMember({id:0,unitId:selected,userId:0,name:'',available:true,order:unitMembers.reduce((max,entry)=>Math.max(max,entry.order),0)+1});};
  const addMembers=async():Promise<void>=>{
    if(lock.current || !api || !pendingUsers.length || !service.resolveUser)return;
    lock.current=true;setBusy(true);setError('');setMessage('');
    let saved=0,skipped=0;
    const remaining=[...pendingUsers];
    let order=unitMembers.reduce((max,entry)=>Math.max(max,entry.order),0)+1;
    try {
      const current=await api.load();
      const existing=new Set(current.members.filter(entry=>entry.unitId===selected).map(entry=>entry.userId));
      order=current.members.filter(entry=>entry.unitId===selected).reduce((max,entry)=>Math.max(max,entry.order),order-1)+1;
      for(const user of pendingUsers){
        const person=await service.resolveUser(user);
        if(!person.Id)throw new Error('Unable to identify '+user.displayName+'.');
        if(existing.has(person.Id)){skipped++;remaining.shift();continue;}
        await api.saveMember({unitId:selected,userId:person.Id,name:person.Title || user.displayName,available:true,order:order++});
        existing.add(person.Id);saved++;remaining.shift();
      }
      setPendingUsers([]);setMember(undefined);setMessage(saved+' members added.'+(skipped ? ' '+skipped+' existing members skipped.' : ''));
    } catch(reason){setPendingUsers(remaining);setError(saved+' members added. '+(reason instanceof Error ? reason.message : 'Unable to add remaining members.')+' Retry to add the remaining people.');}
    finally {
      try{const updated=await api.load();preserveDraft.current=true;setData(updated);}catch{setError('Refresh teams to verify which members were saved before retrying.');}
      lock.current=false;setBusy(false);
    }
  };
  return <div className={[styles.supportUnitsPage,styles.teamsWorkspace].join(' ')}>
    <div className="teams-page-alerts">{message && <MessageBar messageBarType={MessageBarType.success} onDismiss={()=>setMessage('')}>{message}</MessageBar>}</div>
    {selected!==0 && <div className={styles.teamsToolbar}><DefaultButton text="All Support Teams" iconProps={{iconName:'Back'}} styles={cancelButtonStyles} disabled={busy} onClick={()=>choose(0)} /></div>}
    <MissingWorkspaceNotice service={service} error={error} />
    {error && !member && !creating && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    
    {busy && !data ? <Spinner label="Loading teams..." /> : data && <>
      {!selected ? <div className={styles.teamsOverview}>
        <div className={styles.teamsToolbar}><div className="teams-heading-search">{!hideHeading && <h3>Support Teams</h3>}<SearchBox ariaLabel="Search teams" placeholder="Search teams" value={search} onChange={(_,value)=>setSearch(value || '')} /></div></div><div className={styles.teamsToolbar}><span>{filteredTeams.length} of {data.units.length} teams</span><DefaultButton data-create-action="true" className={styles.teamCreateButton} text="Create Teams" iconProps={{iconName:'Add'}} disabled={busy || !data} onClick={()=>{if(leaveDraft()){setNewName('');setError('');setCreating(true);}}} /></div>
        {!!data.units.length && <div data-mobile-team-list="true">{filteredTeams.map(unit=><button type="button" key={unit.id} disabled={busy} aria-label={'Open '+unit.title} onClick={()=>choose(unit.id)}><span>{unit.title}</span><span aria-label="Members">{data.members.filter(entry=>entry.unitId===unit.id).length} users</span><Icon iconName="ChevronRight" aria-hidden="true" /></button>)}</div>}
        {data.units.length ? <div className={styles.tableContainer} data-desktop-team-list="true"><table data-preserve-table="true" className={styles.ticketTable}><thead><tr><th>Team</th><th>Email Address</th><th>Members</th><th>Team Lead</th><th>Status</th><th /></tr></thead><tbody>{filteredTeams.map(unit=><tr key={unit.id}><td><button type="button" className={styles.ticketSubjectLink} disabled={busy} onClick={()=>choose(unit.id)}>{unit.title}</button></td><td>{unit.email ? <a href={'mailto:'+unit.email}>{unit.email}</a> : 'Not set'}</td><td>{data.members.filter(entry=>entry.unitId===unit.id).length}</td><td>{unit.teamLeadMemberId ? memberName(unit) : 'Not selected'}</td><td><span className={styles.teamStatus} data-active={unit.active}>{unit.active ? 'Active' : 'Inactive'}</span></td><td><IconButton iconProps={{iconName:'ChevronRight'}} ariaLabel={'Open '+unit.title} disabled={busy} styles={cancelButtonStyles} onClick={()=>choose(unit.id)} /></td></tr>)}</tbody></table></div> : <div className={styles.supportUnitEmpty}><Icon iconName="People" /><h3>No Teams Yet</h3><p>Create teams, then add their members and assignment settings.</p></div>}
        {data.units.length>0 && !filteredTeams.length && <p>No teams match your search.</p>}
      </div> : draft ? <div className={styles.teamsEditorLayout}>
        <aside className={styles.teamsSidebar} aria-label="Teams"><SearchBox ariaLabel="Find a team" placeholder="Find a team" value={search} onChange={(_,value)=>setSearch(value || '')} /><nav>{filteredTeams.map(unit=><button type="button" key={unit.id} disabled={busy} aria-current={unit.id===selected ? 'page' : undefined} onClick={()=>choose(unit.id)}><span>{unit.title}</span></button>)}</nav></aside>
        <div className={styles.teamsEditor}>
          <form onSubmit={event=>{event.preventDefault();void run(async()=>{const latest=(await api!.load()).units.find(team=>team.id===draft.id);if(!latest)throw new Error('This support team no longer exists.');await api!.saveUnit({...draft,method:latest.method},draft.id);});}}>
            <header className={styles.teamsToolbar}><div><h3>{persisted?.title}</h3><span className={styles.teamStatus} data-active={draft.active}>{draft.active ? 'Active team' : 'Inactive team'}</span></div><div className={styles.teamsButtons}><DefaultButton text="Discard" styles={cancelButtonStyles} disabled={busy || !dirty} onClick={()=>{setDraft(persisted);setError('');}} /><DefaultButton type="submit" styles={cancelButtonStyles} iconProps={{iconName:'Save'}} text={busy ? 'Saving...' : 'Save'} disabled={busy || !dirty} /></div></header>
            <div className={styles.teamDetailsFields}><TextField label="Team Name" required maxLength={255} value={draft.title} disabled={busy} onChange={(_,value)=>setDraft({...draft,title:value || ''})} /><TextField label="Team Email" type="email" placeholder="team@company.com" maxLength={254} value={draft.email || ''} disabled={busy} onChange={(_,value)=>setDraft({...draft,email:value || ''})} /><Dropdown label="Team Lead" placeholder="Select a member" required={draft.method==='Team lead'} selectedKey={draft.teamLeadMemberId || 0} disabled={busy} options={[{key:0,text:'No Team Lead'},...unitMembers.map(entry=>({key:entry.id,text:entry.name+(entry.available?'':' (unavailable)')}))]} onChange={(_,option)=>setDraft({...draft,teamLeadMemberId:Number(option?.key)||undefined})} /><label className="team-active-choice"><input type="checkbox" role="switch" aria-label="Active" checked={draft.active} disabled={busy} onChange={event=>setDraft({...draft,active:event.target.checked})} /><span>Active</span></label></div>
          </form>
          <div className="teams-member-category-grid"><section className={styles.teamMembers} aria-label="Team members"><div className={styles.teamsToolbar}><h4>Members</h4><DefaultButton data-create-action="true" styles={cancelButtonStyles} text="Add Members" iconProps={{iconName:'Add'}} disabled={busy} onClick={addMember} /></div>
            {unitMembers.length ? <div className={styles.tableContainer}><table className={styles.ticketTable}><thead><tr><th>Member</th><th>Role</th><th>Rotation</th><th title="Unavailable members are skipped during automatic assignment">Available</th><th /></tr></thead><tbody>{unitMembers.map(entry=><tr key={entry.id}><td><span className={styles.teamMemberName}><PersonaCoin text={entry.name} coinSize={28} /><span>{entry.name}</span></span></td><td>{entry.id===persisted?.teamLeadMemberId ? <span className={styles.teamStatus} data-role="lead">Team lead</span> : 'Member'}</td><td>{entry.order}</td><td><Checkbox title="When unchecked, automatic assignment skips this member" ariaLabel={'Available for assignment: '+entry.name} checked={entry.available} disabled={busy} onChange={(_,checked)=>{void run(()=>api!.saveMember({...entry,available:Boolean(checked)},entry.id),true);}} /></td><td><div className={styles.teamsButtons}><IconButton iconProps={{iconName:'Edit'}} ariaLabel={'Edit '+entry.name} styles={cancelButtonStyles} disabled={busy} onClick={()=>{setError('');setMember({...entry});}} />{entry.id!==persisted?.teamLeadMemberId && <IconButton iconProps={{iconName:'ContactInfo'}} ariaLabel={'Make '+entry.name+' team lead'} title={'Make '+entry.name+' the team lead. Team lead assignment sends tickets to this member when available.'} styles={cancelButtonStyles} disabled={busy} onClick={()=>{void run(async()=>{await api!.setTeamLead(selected,entry.id);setDraft(current=>current ? {...current,teamLeadMemberId:entry.id} : current);},true);}} />}</div></td></tr>)}</tbody></table></div> : <div className={styles.teamMembersEmpty}><p>No members yet.</p><DefaultButton data-create-action="true" styles={cancelButtonStyles} text="Add Members" iconProps={{iconName:'Add'}} disabled={busy} onClick={addMember} /></div>}
          </section>
          <section className="teams-categories" aria-label="Team categories"><div className={styles.teamsToolbar}><h4>Categories</h4><span>{draft.categoryIds.length} selected of {data.categories.length}</span></div>
            <div className="teams-category-checklist">{data.categories.map(category=>{const owner=data.units.find(unit=>unit.id!==draft.id&&unit.active&&unit.categoryIds.includes(category.id));return <Checkbox key={category.id} label={category.title+(owner?' ('+owner.title+')':'')} checked={draft.categoryIds.includes(category.id)} disabled={busy||Boolean(owner&&!draft.categoryIds.includes(category.id))} onChange={(_,checked)=>setDraft({...draft,categoryIds:checked?[...new Set([...draft.categoryIds,category.id])]:draft.categoryIds.filter(id=>id!==category.id)})} />;})}</div>
            {!data.categories.length&&<p>Add categories in Helpdesk Settings.</p>}
            
          </section></div>
        </div>
      </div> : <MessageBar>This team is no longer available.</MessageBar>}
    </>}
    <Dialog hidden={!creating && !member} onDismiss={busy || personBusy ? undefined : ()=>{setCreating(false);setMember(undefined);setError('');}} dialogContentProps={{title:creating ? 'Create Teams' : member?.id ? 'Edit Member' : 'Add Team Members',showCloseButton:!busy && !personBusy}} modalProps={{isBlocking:true}} minWidth={member&&!member.id?600:440} maxWidth={680}>
      {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
      <form className={styles.adminFormFields} onSubmit={event=>{event.preventDefault();if(personBusy)return;if(creating)void createUnits();else if(member?.id)void run(()=>api!.saveMember(member,member.id));else void addMembers();}}>
        {creating ? <><TextField label="Team Names" required multiline rows={6} description="Enter one team name per line. Existing teams will be skipped." placeholder={'Infrastructure\nApplications\nService Desk'} value={newName} disabled={busy} onChange={(_,value)=>setNewName(value || '')} /><p>Open each team after creation to add members, select categories and choose its team lead.</p></> : member && !member.id ? <><TeamMemberPicker service={service} users={pendingUsers} onChange={setPendingUsers} disabled={busy} existingUserIds={unitMembers.map(entry=>entry.userId)} /><p>Members use this team's categories. Availability and rotation order are set automatically.</p></> : member && <><FormAssigneePicker label="Member" service={service} value={member.userId ? {Id:member.userId,Title:member.name} : null} disabled={busy} onBusy={setPersonBusy} onChange={person=>setMember({...member,userId:person?.Id || 0,name:person?.Title || person?.Email || ''})} /><TextField label="Rotation Order" type="number" min={0} step={1} value={String(member.order)} disabled={busy} onChange={(_,value)=>setMember({...member,order:Number(value)})} /><Checkbox label="Available for Assignment" checked={member.available} disabled={busy} onChange={(_,checked)=>setMember({...member,available:Boolean(checked)})} /><p>Choose an existing DeskPilot agent or Helpdesk Admin.</p></>}
        <div className={styles.faqModalFooter}><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy || personBusy} onClick={()=>{setCreating(false);setMember(undefined);setError('');}} /><PrimaryButton type="submit" disabled={busy || personBusy || (!creating && !member?.id && (!pendingUsers.length || !service.resolveUser))} text={busy ? 'Saving...' : creating ? 'Create Teams' : member?.id ? 'Save Member' : 'Add members'+(pendingUsers.length ? ' ('+pendingUsers.length+')' : '')} /></div>
      </form>
    </Dialog>
  </div>;
}
