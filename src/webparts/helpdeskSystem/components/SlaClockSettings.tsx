import * as React from 'react';
import { Toggle, TextField, Checkbox, DefaultButton, MessageBar, MessageBarType } from '@fluentui/react';
import type { ISlaClockRules, ISlaService } from '../interfaces/ISla';
import { defaultSlaClockRules, validateSlaClockRules } from '../utils/slaClock';
import styles from './SlaSettings.module.scss';
import { cancelButtonStyles } from './cancelButtonStyles';
export function SlaClockSettings(props:{service:ISlaService;rules?:ISlaClockRules;disabled:boolean;onSaved:()=>Promise<void>}):React.ReactElement {
  const [rules,setRules]=React.useState(props.rules||defaultSlaClockRules());
  const [saving,setSaving]=React.useState(false),[error,setError]=React.useState('');
  const lock=React.useRef(false);
  React.useEffect(()=>setRules(props.rules||defaultSlaClockRules()),[props.rules]);
  const change=(value:Partial<ISlaClockRules>):void=>setRules(current=>({...current,...value}));
  const save=async():Promise<void>=>{if(lock.current||!props.service.saveClockRules)return;lock.current=true;setSaving(true);setError('');try{validateSlaClockRules(rules);await props.service.saveClockRules(rules);await props.onSaved();}catch(reason){setError(reason instanceof Error?reason.message:'Unable to save SLA clock rules.');}finally{lock.current=false;setSaving(false);}};
  const disabled=props.disabled||saving||!props.service.saveClockRules;
  const time=(minute:number):string=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
  const minute=(text:string):number=>{const [h,m]=text.split(':').map(Number);return h*60+m;};
  const row=(title:string,description:string,checked:boolean,key:'businessHoursOnly'|'pausePending'|'markAtRisk'|'notifyTeamLead',extra?:React.ReactNode):React.ReactElement=><div className={styles.clockRow}><div><h4>{title}</h4><p>{description}</p></div><div className={styles.clockControls}>{extra}<Toggle ariaLabel={title} checked={checked} disabled={disabled} onChange={(_,value)=>change({[key]:Boolean(value)})}/></div></div>;
  return <section className={styles.clockCard}><header><div><h3>How the Clock Runs</h3><p>These rules apply to every priority.</p></div><DefaultButton text={saving?'Saving...':'Save'} iconProps={{iconName:'Save'}} styles={cancelButtonStyles} disabled={disabled||JSON.stringify(rules)===JSON.stringify(props.rules||defaultSlaClockRules())} onClick={()=>{void save();}} /></header>
    {error&&<MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {row('Count Business Hours Only','Off: the clock runs 24 hours a day, including weekends.',rules.businessHoursOnly,'businessHoursOnly')}
    {rules.businessHoursOnly&&<div className={styles.schedule}><TextField label="Time Zone" value={rules.timeZone} disabled={disabled} onChange={(_,value)=>change({timeZone:value||''})} description="IANA name, for example Africa/Accra. Holidays are not excluded."/><div className={styles.scheduleTimes}><TextField label="Start Time" type="time" value={time(rules.startMinute)} disabled={disabled} onChange={(_,value)=>change({startMinute:minute(value||'')})}/><TextField label="End Time" type="time" value={time(rules.endMinute)} disabled={disabled} onChange={(_,value)=>change({endMinute:minute(value||'')})}/></div><div className={styles.workDays}>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day,index)=><Checkbox key={day} label={day} checked={rules.workDays.includes(index)} disabled={disabled} onChange={(_,checked)=>change({workDays:checked?[...rules.workDays,index].sort():rules.workDays.filter(value=>value!==index)})}/>)}</div></div>}
    {row('Pause When Status Is Pending','Off: time on hold counts toward the target.',rules.pausePending,'pausePending')}
    {rules.pausePending&&<p className={styles.ruleHint}>Pauses are recorded for status changes made in DeskPilot. Older tickets without reliable pause history show Unknown. Email and Forms automations must maintain SlaPauseIntervals when they change status.</p>}
    {row('Mark Tickets at Risk','Shows an amber SLA state so agents can act before a breach.',rules.markAtRisk,'markAtRisk',<TextField ariaLabel="At-risk percentage" type="number" min={1} max={99} suffix="% of time" value={String(rules.atRiskPercent)} disabled={disabled||!rules.markAtRisk} onChange={(_,value)=>change({atRiskPercent:Number(value)})} styles={{root:{width:140}}}/>)}
    {row('Notify Team Lead on Breach','Sends an alert when a target is missed.',rules.notifyTeamLead,'notifyTeamLead')}
    {rules.notifyTeamLead&&<p className={styles.ruleHint}>Checked while a Helpdesk Admin has DeskPilot open. Enable Ticket Notifications and configure team leads first. Edit the SLA Breach template under Email &amp; Notifications. Unattended alerts need background automation.</p>}
  </section>;
}
