import * as React from 'react';
import { Dropdown } from '@fluentui/react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import styles from './HelpdeskSystem.module.scss';

export function SettingsDepartmentContext(props:{service:ITicketDataSource;onChange:()=>void;compact?:boolean;disabled?:boolean}):React.ReactElement|null {
  const scope=props.service.settingsScope;
  if(!scope)return null;
  if(props.compact)return <Dropdown ariaLabel="Settings department" title="Settings department" placeholder="Select department" disabled={props.disabled} selectedKey={scope.selectedId} styles={{root:{minWidth:160,maxWidth:240}}} options={scope.departments.map(value=>({key:value.id,text:value.name}))} onChange={(_,option)=>{if(option){scope.select(Number(option.key));props.onChange();}}} />;
  return <div className={styles.ticketToolbar}><div className={styles.ticketControls}><Dropdown label="Settings department" ariaLabel="Settings department" placeholder="Select department" selectedKey={scope.selectedId} options={scope.departments.map(value=>({key:value.id,text:value.name}))} onChange={(_,option)=>{if(option){scope.select(Number(option.key));props.onChange();}}} /></div><span>Choose the department whose settings you want to manage.</span></div>;
}
