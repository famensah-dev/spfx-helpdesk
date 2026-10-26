import * as React from 'react';
import { DatePicker, TextField } from '@fluentui/react';
export function TicketDueDatePicker({value,onChange,disabled,required}:{value:string;onChange:(value:string)=>void;disabled?:boolean;required?:boolean}):React.ReactElement {
  const parsed=value?new Date(value):undefined;
  const date=parsed&&Number.isFinite(parsed.getTime())?parsed:undefined;
  const pad=(number:number):string=>String(number).padStart(2,'0');
  const update=(day:Date,time:string):void=>onChange(day.getFullYear()+'-'+pad(day.getMonth()+1)+'-'+pad(day.getDate())+'T'+time);
  const time=date?pad(date.getHours())+':'+pad(date.getMinutes()):'';
  return <div className="ticket-due-picker"><DatePicker label="Due date" placeholder="Choose a date" ariaLabel="Due date" isRequired={required} disabled={disabled} value={date} formatDate={day=>day?day.toLocaleDateString():''} onSelectDate={day=>{if(day)update(day,time||'09:00');else onChange('');}} /><TextField label="Time" ariaLabel="Due time" type="time" required={required&&Boolean(date)} disabled={disabled} value={time} onChange={(_,next)=>{if(next)update(date||new Date(),next);else onChange('');}} />{value&&<button type="button" disabled={disabled} onClick={()=>onChange('')} aria-label="Clear due date">Clear</button>}</div>;
}
