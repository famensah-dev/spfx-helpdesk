import * as React from 'react';
import { Dropdown, TextField } from '@fluentui/react';
import styles from './SlaSettings.module.scss';
export function SlaDurationField(props:{label:string;minutes?:number;disabled:boolean;onChange:(minutes:number|undefined)=>void}):React.ReactElement {
  const [unit,setUnit]=React.useState(props.minutes && props.minutes>=60 && props.minutes%60===0?60:1);
  return <div className={styles.durationField}><TextField label={props.label} required type="number" min={unit===60?1/60:1} step="any" value={props.minutes===undefined?'':String(Number((props.minutes/unit).toFixed(4)))} disabled={props.disabled} onChange={(_,value)=>props.onChange(value?Math.round(Number(value)*unit):undefined)}/><Dropdown ariaLabel={props.label+' unit'} selectedKey={unit} disabled={props.disabled} options={[{key:1,text:'Minutes'},{key:60,text:'Hours'}]} onChange={(_,option)=>setUnit(Number(option?.key)||1)}/></div>;
}
