import * as React from 'react';
import { Dropdown } from '@fluentui/react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import styles from './HelpdeskSystem.module.scss';

export function SettingsDepartmentContext(props:{service:ITicketDataSource;onChange:()=>void}):React.ReactElement|null {
  const scope=props.service.settingsScope;
  if(!scope)return null;
  return <div className={styles.ticketToolbar}><div className={styles.ticketControls}><Dropdown ariaLabel="Settings department" placeholder="Select department" selectedKey={scope.selectedId} options={scope.departments.map(value=>({key:value.id,text:value.name}))} onChange={(_,option)=>{if(option){scope.select(Number(option.key));props.onChange();}}} /></div></div>;
}
