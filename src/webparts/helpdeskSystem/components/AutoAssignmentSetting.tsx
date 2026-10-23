import * as React from 'react';
import { MessageBar, MessageBarType, Spinner, Toggle } from '@fluentui/react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import { MissingWorkspaceNotice } from './WorkspaceSetupPanel';
import styles from './HelpdeskSystem.module.scss';
export function AutoAssignmentSetting({service}:{service:ITicketDataSource}):React.ReactElement | null {
  const api=service.supportUnits;
  const [enabled,setEnabled]=React.useState(false);
  const [busy,setBusy]=React.useState(true);
  const [error,setError]=React.useState('');
  const lock=React.useRef(false);
  React.useEffect(()=>{let active=true;api?.load().then(data=>{if(active)setEnabled(data.autoAssignEnabled);}).catch(reason=>{if(active)setError(reason instanceof Error ? reason.message : 'Unable to load assignment settings.');}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[api]);
  if(!api)return null;
  const save=async(value:boolean):Promise<void>=>{
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{await api.setAutoAssignment(value);setEnabled((await api.load()).autoAssignEnabled);}
    catch(reason){setError(reason instanceof Error ? reason.message : 'Unable to save assignment settings.');}
    finally{lock.current=false;setBusy(false);}
  };
  return <><div className={styles.supportAutoAssignment}><div><h4>Auto assign tickets</h4><p>Use the ticket category to find its support team, then follow the team assignment method and member order. Configure units under Helpdesk settings &gt; Support Teams.</p></div><Toggle ariaLabel="Auto assign tickets" checked={enabled} disabled={busy} onText="On" offText="Off" onChange={(_,value)=>{void save(Boolean(value));}} />{busy && <Spinner ariaLabel="Updating assignment settings" />}</div><MissingWorkspaceNotice service={service} error={error} />{error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}</>;
}
