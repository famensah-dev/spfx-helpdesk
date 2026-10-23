import * as React from 'react';
import { Checkbox, ChoiceGroup, DefaultButton, Dialog, Dropdown, Icon, IconButton, MessageBar, MessageBarType, PrimaryButton, SearchBox, Spinner, TextField } from '@fluentui/react';
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
    catch(reason){setError(reason instanceof Error ? reason.message : 'Unable to save unit changes.');}
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
    }catch(reason){setError(reason instanceof Error ? reason.message : 'Unit creation could not be confirmed.');}
    finally{lock.current=false;setBusy(false);}
  };
  const unitMembers=(data?.members || []).filter(entry=>entry.unitId===selected).sort((a,b)=>a.order-b.order || a.id-b.id);
  const persisted=data?.units.find(unit=>unit.id===selected);
  const dirty=Boolean(draft && persisted && JSON.stringify(draft)!==JSON.stringify(persisted));
  const leaveDraft=():boolean=>!dirty || window.confirm('Discard unsaved team settings?');
  const choose=(id:number):void=>{if(leaveDraft()){setSelected(id);setError('');setMessage('');}};
  const memberName=(unit:ISupportUnit):string=>data?.members.find(entry=>entry.id===unit.teamLeadMemberId && entry.unitId===unit.id)?.name || 'Choose a member';
  return <div className={styles.supportUnitsPage}>
    <div className={styles.supportUnitsHeading}><div>{selected ? <DefaultButton text="Back to teams" iconProps={{iconName:'Back'}} styles={cancelButtonStyles} disabled={busy} onClick={()=>choose(0)} /> : <><h3>Support Teams</h3><p>Create teams, then open one to set its members and ticket assignment.</p></>}</div>{!selected && <PrimaryButton text="Create teams" iconProps={{iconName:'Add'}} disabled={busy || !data} onClick={()=>{if(leaveDraft()){setNewName('');setError('');setCreating(true);}}} />}</div>
    <MissingWorkspaceNotice service={service} error={error} />
    {error && !member && !creating && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {message && <MessageBar messageBarType={MessageBarType.success} onDismiss={()=>setMessage('')}>{message}</MessageBar>}
    {busy && !data ? <Spinner label="Loading support teams..." /> : data && <>
      {!selected && <>
        <div className={styles.supportUnitsHeading}><SearchBox ariaLabel="Search teams" placeholder="Find a team" value={search} onChange={(_,value)=>setSearch(value || '')} /><span>{data.units.length} teams</span></div>
        <div className={styles.supportUnitCards}>{data.units.filter(unit=>unit.title.toLowerCase().includes(search.toLowerCase())).map(unit=>{
          const members=data.members.filter(entry=>entry.unitId===unit.id);
          const ready=unit.categoryIds.length>0 && members.some(entry=>entry.available) && (unit.method==='Round robin' || members.some(entry=>entry.id===unit.teamLeadMemberId && entry.available));
          return <button type="button" key={unit.id} disabled={busy} onClick={()=>choose(unit.id)} className={styles.supportUnitCard}><div className={styles.supportUnitCardHeading}><Icon iconName="People" /><strong>{unit.title}</strong><Icon iconName="ChevronRight" /></div><span>{members.length} members | {unit.categoryIds.length} categories</span><span>{unit.method==='Team lead' ? memberName(unit) : 'Round robin'}</span><small>{!unit.active ? 'Inactive' : ready ? 'Configured' : 'Set up this team'}</small></button>;
        })}</div>
        {!data.units.length && <div className={styles.supportUnitEmpty}><Icon iconName="People" /><h3>Create your support teams</h3><p>Add several team names at once. Open each team afterward to configure ticket assignment.</p></div>}
        {data.units.length>0 && !data.units.some(unit=>unit.title.toLowerCase().includes(search.toLowerCase())) && <p>No units match your search.</p>}
      </>}
      {selected>0 && draft && <div className={styles.supportUnitContent}>
        <form onSubmit={event=>{event.preventDefault();void run(()=>api!.saveUnit(draft,draft.id));}}>
          <div className={styles.supportUnitTitle}><div><h3>{persisted?.title}</h3><span>{persisted?.categoryIds.length || 0} categories - {persisted?.method==='Team lead' ? `Assigned to ${memberName(persisted)}` : 'Round-robin assignment'}</span></div><Checkbox label="Active team" checked={draft.active} disabled={busy} onChange={(_,checked)=>setDraft({...draft,active:Boolean(checked)})} /></div>
          <section className={styles.supportUnitSection}><h4>Team details</h4><TextField label="Team name" required maxLength={255} value={draft.title} disabled={busy} onChange={(_,value)=>setDraft({...draft,title:value || ''})} /></section>
          <section className={styles.supportUnitSection}><h4>Ticket categories</h4><p>Tickets in these categories will be assigned to this team.</p><div className={styles.supportUnitCategories}>{data.categories.map(category=>{const owner=data.units.find(unit=>unit.id!==draft.id && unit.active && unit.categoryIds.includes(category.id));return <Checkbox key={category.id} label={category.title+(owner ? ` - ${owner.title}` : '')} checked={draft.categoryIds.includes(category.id)} disabled={busy || Boolean(owner && !draft.categoryIds.includes(category.id))} onChange={(_,checked)=>setDraft({...draft,categoryIds:checked ? [...draft.categoryIds,category.id] : draft.categoryIds.filter(id=>id!==category.id)})} />;})}</div>{!data.categories.length && <p>Add ticket categories in Helpdesk settings first.</p>}</section>
          <section className={styles.supportUnitSection}><h4>Assignment</h4><ChoiceGroup label="How should tickets be assigned?" selectedKey={draft.method} disabled={busy} options={[{key:'Round robin',text:'Round robin - take turns among available members'},{key:'Team lead',text:'Assign to team lead - send tickets to the team lead'}]} onChange={(_,option)=>setDraft({...draft,method:option!.key as ISupportUnit['method']})} />
            <Dropdown label="Team lead" placeholder="Choose a team member" selectedKey={draft.teamLeadMemberId || 0} disabled={busy} required={draft.method==='Team lead'} options={[{key:0,text:'Select a team lead'},...unitMembers.map(entry=>({key:entry.id,text:entry.name+(entry.available ? '' : ' (unavailable)'),disabled:false}))]} onChange={(_,option)=>setDraft({...draft,teamLeadMemberId:Number(option?.key) || undefined})} />
            <p>{draft.method==='Team lead' ? 'New tickets go to the team lead. Make a member the team lead in the members table, or select one here.' : 'Unavailable members are skipped and tickets rotate through the available members.'} If no configured assignee is available, the ticket stays with this team for administrator review.</p>
          </section>
          <div className={styles.supportUnitSave}><DefaultButton text="Discard changes" styles={cancelButtonStyles} disabled={busy || !dirty} onClick={()=>{setDraft(persisted);setError('');}} /><PrimaryButton type="submit" text={busy ? 'Saving...' : 'Save settings'} disabled={busy || !dirty} /></div>
        </form>
        <section className={styles.supportUnitSection}><div className={styles.supportUnitTitle}><div><h4>Members</h4><p>Available members can receive tickets. Rotation follows the order shown.</p></div><DefaultButton text="Add member" iconProps={{iconName:'AddFriend'}} disabled={busy} onClick={()=>{setError('');setMember({id:0,unitId:selected,userId:0,name:'',available:true,order:unitMembers.reduce((max,entry)=>Math.max(max,entry.order),0)+1});}} /></div>
          <div className={styles.tableContainer}><table className={styles.ticketTable}><thead><tr><th>Member</th><th>Team Role</th><th>Rotation Order</th><th>Availability</th><th /></tr></thead><tbody>{unitMembers.map(entry=><tr key={entry.id}><td>{entry.name}</td><td>{entry.id===persisted?.teamLeadMemberId ? 'Team lead' : 'Member'}</td><td>{entry.order}</td><td>{entry.available ? 'Available' : 'Unavailable'}</td><td>{entry.id!==persisted?.teamLeadMemberId && <DefaultButton text="Make team lead" styles={cancelButtonStyles} disabled={busy} onClick={()=>{void run(async()=>{await api!.setTeamLead(selected,entry.id);setDraft(current=>current ? {...current,teamLeadMemberId:entry.id} : current);},true);}} />}<IconButton iconProps={{iconName:'Edit'}} ariaLabel={`Edit ${entry.name}`} disabled={busy} onClick={()=>{setError('');setMember({...entry});}} /></td></tr>)}</tbody></table></div>{!unitMembers.length && <p>No members yet. Add your team's agents here, then choose an assignment method above.</p>}
        </section>
      </div>}
    </>}
    <p className={styles.adminHint}>Enable Auto assignment in Helpdesk settings to route new DeskPilot tickets through these teams. Forms and email intake need a Power Automate routing flow. Team membership does not change app roles or SharePoint access.</p>
    <Dialog hidden={!creating && !member} onDismiss={busy || personBusy ? undefined : ()=>{setCreating(false);setMember(undefined);setError('');}} dialogContentProps={{title:creating ? 'Create teams' : member?.id ? 'Edit member' : 'Add team member',showCloseButton:!busy && !personBusy}} modalProps={{isBlocking:true}} minWidth={440}>
      {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
      <form className={styles.adminFormFields} onSubmit={event=>{event.preventDefault();if(personBusy)return;if(creating)void createUnits();else if(member)void run(()=>api!.saveMember(member,member.id || undefined));}}>
        {creating ? <><TextField label="Team names" required multiline rows={6} description="Enter one team name per line. Existing teams will be skipped." placeholder={'Infrastructure\nApplications\nService Desk'} value={newName} disabled={busy} onChange={(_,value)=>setNewName(value || '')} /><p>Open each team after creation to add members, select categories and choose its assignment method.</p></> : member && <><FormAssigneePicker label="Member" service={service} value={member.userId ? {Id:member.userId,Title:member.name} : null} disabled={busy} onBusy={setPersonBusy} onChange={person=>setMember({...member,userId:person?.Id || 0,name:person?.Title || person?.Email || ''})} /><TextField label="Rotation order" type="number" min={0} step={1} value={String(member.order)} disabled={busy} onChange={(_,value)=>setMember({...member,order:Number(value)})} /><Checkbox label="Available for assignment" checked={member.available} disabled={busy} onChange={(_,checked)=>setMember({...member,available:Boolean(checked)})} /><p>Choose an existing DeskPilot agent or Helpdesk Admin.</p></>}
        <div className={styles.faqModalFooter}><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy || personBusy} onClick={()=>{setCreating(false);setMember(undefined);setError('');}} /><PrimaryButton type="submit" text={busy ? 'Saving...' : creating ? 'Create teams' : 'Save member'} disabled={busy || personBusy} /></div>
      </form>
    </Dialog>
  </div>;
}
