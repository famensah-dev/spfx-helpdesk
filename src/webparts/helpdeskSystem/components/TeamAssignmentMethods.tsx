import * as React from 'react';
import { ChoiceGroup, MessageBar, MessageBarType, Spinner } from '@fluentui/react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import type { AssignmentMethod, ISupportUnitData } from '../interfaces/ISupportUnits';
import { MissingWorkspaceNotice } from './WorkspaceSetupPanel';
import styles from './HelpdeskSystem.module.scss';

export function TeamAssignmentMethods({service}:{service:ITicketDataSource}):React.ReactElement {
  const api=service.supportUnits;
  const [data,setData]=React.useState<ISupportUnitData>();
  const [busy,setBusy]=React.useState(true);
  const [error,setError]=React.useState('');
  const lock=React.useRef(false);
  React.useEffect(()=>{let active=true;api?.load().then(value=>{if(active)setData(value);}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Unable to load teams.');}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[api]);
  const update=async(method:AssignmentMethod):Promise<void>=>{
    if(!api||lock.current)return;
    lock.current=true;setBusy(true);setError('');
    try{
      const current=await api.load();
      const missing=current.units.filter(team=>team.active&&(!team.teamLeadMemberId||!current.members.some(member=>member.unitId===team.id&&member.id===team.teamLeadMemberId)));
      if(method==='Team lead'&&missing.length)throw new Error('Choose team leads in Support teams first: '+missing.map(team=>team.title).join(', ')+'.');
      let saved=0;
      try {
        for(const team of current.units.filter(team=>team.method!==method)){
          await api.saveUnit({title:team.title,email:team.email,active:team.active,method,categoryIds:team.categoryIds,teamLeadMemberId:team.teamLeadMemberId},team.id);
          saved++;
        }
      }catch(reason){throw new Error(saved+' teams updated. '+(reason instanceof Error?reason.message:'Unable to update the remaining teams.')+' Retry to finish.');}
    }catch(reason){setError(reason instanceof Error?reason.message:'Unable to update assignment methods.');}
    finally{
      try{setData(await api.load());}catch{setError('Refresh Helpdesk Settings to verify team assignment methods.');}
      lock.current=false;setBusy(false);
    }
  };
  const methods=new Set(data?.units.map(team=>team.method));
  return <div className="settings-team-methods">
    <ChoiceGroup className={styles.ticketPriorityChoices} aria-label="Assignment method for all support teams" selectedKey={methods.size===1?Array.from(methods)[0]:null} disabled={busy||!data?.units.length} options={[{key:'Round robin',text:'Round robin'},{key:'Team lead',text:'Team lead'}]} onChange={(_,option)=>{if(option)void update(option.key as AssignmentMethod);}} />
    {busy&&<Spinner ariaLabel="Updating assignment method" />}
    <MissingWorkspaceNotice service={service} error={error} />
    {error&&<MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {data&&methods.size>1&&<p>Teams currently use different methods. Selecting one applies it to all teams.</p>}
    {data&&!data.units.length&&<p>Create a support team to configure assignment.</p>}
  </div>;
}