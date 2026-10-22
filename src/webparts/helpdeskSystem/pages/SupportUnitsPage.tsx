import * as React from 'react';
import { Checkbox, DefaultButton, Dialog, Dropdown, IconButton, MessageBar, MessageBarType, PrimaryButton, Spinner, TextField } from '@fluentui/react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import type { ISupportUnitData, ISupportUnit, IUnitMember, IRoutingRule } from '../interfaces/ISupportUnits';
import { FormAssigneePicker } from '../components/FormAssigneePicker';
import { MissingWorkspaceNotice } from '../components/WorkspaceSetupPanel';
import { cancelButtonStyles } from '../components/cancelButtonStyles';
import styles from '../components/HelpdeskSystem.module.scss';
type Editor = {kind:'unit';value:ISupportUnit} | {kind:'member';value:IUnitMember} | {kind:'rule';value:IRoutingRule};
export function SupportUnitsPage({service}:{service:ITicketDataSource}):React.ReactElement {
  const [data,setData] = React.useState<ISupportUnitData>();
  const [tab,setTab] = React.useState<'units'|'members'|'rules'>('units');
  const [editor,setEditor] = React.useState<Editor>();
  const [busy,setBusy] = React.useState(false);
  const [personBusy,setPersonBusy] = React.useState(false);
  const [error,setError] = React.useState('');
  const [message,setMessage] = React.useState('');
  const [ticketId,setTicketId] = React.useState('');
  const lock = React.useRef(false);
  const api = service.supportUnits;
  const load = React.useCallback(async ():Promise<void> => {if (api) setData(await api.load());},[api]);
  React.useEffect(() => {let active=true; setBusy(true); api?.load().then(result => {if(active)setData(result);}).catch(reason => {if(active)setError(reason instanceof Error ? reason.message : 'Unable to load support units.');}).finally(() => {if(active)setBusy(false);}); return () => {active=false;};},[api]);
  const run = async (action:()=>Promise<string|void>):Promise<void> => {
    if (lock.current || !api) return;
    lock.current=true;setBusy(true);setError('');setMessage('');
    try {const result=await action();setEditor(undefined);setMessage(result || 'Changes saved.');await load();}
    catch(reason){setError(reason instanceof Error ? reason.message : 'Unable to save support unit changes.');}
    finally {lock.current=false;setBusy(false);}
  };
  const unitName = (id:number):string => data?.units.find(unit => unit.id===id)?.title || `Unit #${id}`;
  const categoryName = (id:number):string => data?.categories.find(category => category.id===id)?.title || `Category #${id}`;
  const unitOptions = (data?.units || []).map(unit => ({key:unit.id,text:unit.title+(unit.active ? '' : ' (inactive)')}));
  const add = ():void => {
    setError('');
    if(tab==='units')setEditor({kind:'unit',value:{id:0,title:'',active:true,method:'Round robin',lastMemberId:0}});
    else if(tab==='members')setEditor({kind:'member',value:{id:0,unitId:data?.units[0]?.id || 0,userId:0,name:'',available:true,order:0}});
    else setEditor({kind:'rule',value:{id:0,title:'',categoryId:0,unitId:data?.units[0]?.id || 0,active:true}});
  };
  return <div className={styles.ticketListCard}>
    <h3>Support Units</h3>
    <p className={styles.adminHint}>Helpdesk Admins and Super Admins can manage units, membership and category routing. Each category routes to one support unit.</p>
    <nav className={styles.adminTabs} aria-label="Support unit settings">{(['units','members','rules'] as const).map(key => <button key={key} type="button" disabled={busy} aria-current={tab===key ? 'page' : undefined} onClick={() => setTab(key)}>{key==='units' ? 'Units' : key==='members' ? 'Unit Members' : 'Routing Rules'}</button>)}</nav>
    <MissingWorkspaceNotice service={service} error={error} />
    {error && !editor && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {message && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setMessage('')}>{message}</MessageBar>}
    <p className={styles.adminHint}>New tickets created in DeskPilot are routed automatically. Existing assignees are preserved. Forms and email tickets require a Power Automate flow; see the support unit setup guide supplied with this app.</p>
    <div className={styles.ticketToolbar}><div className={styles.ticketControls}><IconButton iconProps={{iconName:'Refresh'}} ariaLabel="Refresh support units" disabled={busy} onClick={() => {void run(load);}} /></div><DefaultButton text={tab==='units' ? 'New unit' : tab==='members' ? 'Add member' : 'New rule'} iconProps={{iconName:'Add'}} disabled={busy || !data || (tab!=='units' && !data.units.length)} onClick={add} /></div>
    {busy && !data ? <Spinner label="Loading support units..." /> : data && <div className={styles.tableContainer}>
      {tab==='units' ? <table className={styles.ticketTable}><thead><tr><th>Unit Name</th><th>Assignment Method</th><th>Available Members</th><th>Status</th><th>Actions</th></tr></thead><tbody>{data.units.map(unit => <tr key={unit.id}><td>{unit.title}</td><td>{unit.method}</td><td>{data.members.filter(member => member.unitId===unit.id && member.available).length}</td><td>{unit.active ? 'Active' : 'Inactive'}</td><td><DefaultButton text="Edit" disabled={busy} onClick={() => {setError('');setEditor({kind:'unit',value:{...unit}});}} /></td></tr>)}</tbody></table> : tab==='members' ? <table className={styles.ticketTable}><thead><tr><th>Member</th><th>Unit</th><th>Rotation Order</th><th>Availability</th><th>Actions</th></tr></thead><tbody>{data.members.map(member => <tr key={member.id}><td>{member.name}</td><td>{unitName(member.unitId)}</td><td>{member.order}</td><td>{member.available ? 'Available' : 'Unavailable'}</td><td><DefaultButton text="Edit" disabled={busy} onClick={() => {setError('');setEditor({kind:'member',value:{...member}});}} /></td></tr>)}</tbody></table> : <table className={styles.ticketTable}><thead><tr><th>Category</th><th>Unit</th><th>Status</th><th>Actions</th></tr></thead><tbody>{data.rules.map(rule => <tr key={rule.id}><td>{categoryName(rule.categoryId)}</td><td>{unitName(rule.unitId)}</td><td>{rule.active ? 'Active' : 'Inactive'}</td><td><DefaultButton text="Edit" disabled={busy} onClick={() => {setError('');setEditor({kind:'rule',value:{...rule}});}} /></td></tr>)}</tbody></table>}
      {!(tab==='units' ? data.units : tab==='members' ? data.members : data.rules).length && <p>No {tab==='rules' ? 'routing rules' : tab==='members' ? 'unit members' : 'support units'} yet.</p>}
    </div>}
    <div className={styles.supportUnitRouting}><TextField label="Route an existing unassigned ticket" placeholder="Ticket ID" type="number" min={1} value={ticketId} disabled={busy} onChange={(_,value)=>setTicketId(value || '')} /><DefaultButton text="Route ticket" disabled={busy || !data || !Number.isSafeInteger(Number(ticketId)) || Number(ticketId)<1} onClick={()=>{void run(()=>api!.routeTicket(Number(ticketId)));}} /></div>
    <Dialog hidden={!editor} onDismiss={busy || personBusy ? undefined : ()=>{setEditor(undefined);setError('');}} dialogContentProps={{title:editor?.kind==='unit' ? 'Support Unit' : editor?.kind==='member' ? 'Unit Member' : 'Routing Rule',showCloseButton:!busy && !personBusy}} modalProps={{isBlocking:true}} minWidth={480}>
      {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
      <form className={styles.adminFormFields} onSubmit={event=>{event.preventDefault();if(!editor || personBusy)return; const current=editor;void run(()=>current.kind==='unit' ? api!.saveUnit(current.value,current.value.id || undefined) : current.kind==='member' ? api!.saveMember(current.value,current.value.id || undefined) : api!.saveRule(current.value,current.value.id || undefined));}}>
        {editor?.kind==='unit' && <><TextField label="Unit name" required maxLength={255} disabled={busy} value={editor.value.title} onChange={(_,value)=>setEditor({...editor,value:{...editor.value,title:value || ''}})} /><Dropdown label="Assignment method" selectedKey={editor.value.method} disabled={busy} options={[{key:'Round robin',text:'Round robin'},{key:'Unit queue',text:'Unit queue (manual assignment)'}]} onChange={(_,option)=>setEditor({...editor,value:{...editor.value,method:option!.key as ISupportUnit['method']}})} /><p className={styles.adminHint}>Round robin rotates through available members. Unit queue keeps tickets unassigned for an administrator to assign. If nobody is available, round robin also leaves the ticket in the unit queue.</p><Checkbox label="Active" disabled={busy} checked={editor.value.active} onChange={(_,checked)=>setEditor({...editor,value:{...editor.value,active:Boolean(checked)}})} /></>}
        {editor?.kind==='member' && <><Dropdown label="Support unit" required options={unitOptions} selectedKey={editor.value.unitId} disabled={busy} onChange={(_,option)=>setEditor({...editor,value:{...editor.value,unitId:Number(option?.key)}})} /><FormAssigneePicker label="Member" service={service} value={editor.value.userId ? {Id:editor.value.userId,Title:editor.value.name} : null} disabled={busy} onBusy={setPersonBusy} onChange={person=>setEditor({...editor,value:{...editor.value,userId:person?.Id || 0,name:person?.Title || person?.Email || ''}})} /><p className={styles.adminHint}>Choose an existing DeskPilot agent or Helpdesk Admin. Unit membership does not grant DeskPilot or SharePoint access. A person can belong to multiple units.</p><TextField label="Rotation order" type="number" min={0} step={1} disabled={busy} value={String(editor.value.order)} onChange={(_,value)=>setEditor({...editor,value:{...editor.value,order:Number(value)}})} /><Checkbox label="Available for automatic assignment" checked={editor.value.available} disabled={busy} onChange={(_,checked)=>setEditor({...editor,value:{...editor.value,available:Boolean(checked)}})} /></>}
        {editor?.kind==='rule' && <><Dropdown label="Category" required options={(data?.categories || []).map(category=>({key:category.id,text:category.title}))} selectedKey={editor.value.categoryId} disabled={busy} onChange={(_,option)=>setEditor({...editor,value:{...editor.value,categoryId:Number(option?.key)}})} /><Dropdown label="Assign to unit" required options={unitOptions} selectedKey={editor.value.unitId} disabled={busy} onChange={(_,option)=>setEditor({...editor,value:{...editor.value,unitId:Number(option?.key)}})} /><Checkbox label="Active" disabled={busy} checked={editor.value.active} onChange={(_,checked)=>setEditor({...editor,value:{...editor.value,active:Boolean(checked)}})} /></>}
        <div className={styles.faqModalFooter}><PrimaryButton type="submit" text={busy ? 'Saving...' : 'Save'} disabled={busy || personBusy} /><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy || personBusy} onClick={()=>{setEditor(undefined);setError('');}} /></div>
      </form>
    </Dialog>
  </div>;
}
