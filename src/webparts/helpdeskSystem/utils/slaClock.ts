import type { ISlaClockRules } from '../interfaces/ISla';
export const defaultSlaClockRules = (): ISlaClockRules => ({ businessHoursOnly:false, pausePending:false, markAtRisk:true, atRiskPercent:75, notifyTeamLead:false, timeZone:'UTC', workDays:[1,2,3,4,5], startMinute:480, endMinute:1020 });
export function validateSlaClockRules(value: ISlaClockRules): void {
  if (!value || ['businessHoursOnly','pausePending','markAtRisk','notifyTeamLead'].some(key => typeof value[key as keyof ISlaClockRules] !== 'boolean')) throw new Error('Choose valid SLA clock switches.');
  if (!Number.isInteger(value.atRiskPercent) || value.atRiskPercent < 1 || value.atRiskPercent > 99) throw new Error('At-risk threshold must be between 1 and 99 percent.');
  if (!Array.isArray(value.workDays) || !value.workDays.length || value.workDays.some(day=>!Number.isInteger(day)||day<0||day>6) || new Set(value.workDays).size !== value.workDays.length) throw new Error('Choose at least one working day.');
  if (![value.startMinute,value.endMinute].every(Number.isInteger) || value.startMinute < 0 || value.endMinute > 1440 || value.endMinute <= value.startMinute) throw new Error('Business hours must end after they start on the same day.');
  try { new Intl.DateTimeFormat('en',{timeZone:value.timeZone}).format(); } catch { throw new Error('Enter a valid IANA time zone, for example Africa/Accra.'); }
}
export function formatSlaDuration(minutes?: number): string {
  if (!minutes || !Number.isFinite(minutes)) return 'Not Configured';
  if (minutes < 60) return `${minutes} ${minutes===1?'minute':'minutes'}`;
  const hours=Math.floor(minutes/60), remainder=minutes%60;
  return `${hours} ${hours===1?'hour':'hours'}`+(remainder?` ${remainder} min`:'');
}
const formatters=new Map<string,Intl.DateTimeFormat>();
function parts(timestamp:number,zone:string):number[] {
  let formatter=formatters.get(zone);if(!formatter){formatter=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});formatters.set(zone,formatter);}
  const values=formatter.formatToParts(new Date(timestamp));return ['year','month','day','hour','minute','second'].map(key=>Number(values.find(value=>value.type===key)?.value));
}
function zonedTime(day:number,minute:number,zone:string):number {
  const date=new Date(day), expected=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate(),0,minute);
  let result=expected;
  for(let attempt=0;attempt<4;attempt++){const [y,m,d,h,min,s]=parts(result,zone);const delta=expected-Date.UTC(y,m-1,d,h,min,s);result+=delta;if(!delta)break;}
  return result;
}
const windows=new Map<string,[number,number]>();
export function slaElapsed(start:number,end:number,rules:ISlaClockRules):number {
  if(end<=start)return 0;
  if(!rules.businessHoursOnly)return end-start;
  const [y,m,d]=parts(start,rules.timeZone), [ey,em,ed]=parts(end,rules.timeZone);
  let total=0;
  for(let day=Date.UTC(y,m-1,d),last=Date.UTC(ey,em-1,ed);day<=last;day+=86400000){
    if(!rules.workDays.includes(new Date(day).getUTCDay()))continue;
    const key=[day,rules.timeZone,rules.startMinute,rules.endMinute].join(':');let window=windows.get(key);
    if(!window){window=[zonedTime(day,rules.startMinute,rules.timeZone),zonedTime(day,rules.endMinute,rules.timeZone)];if(windows.size>10000)windows.clear();windows.set(key,window);}
    total+=Math.max(0,Math.min(end,window[1])-Math.max(start,window[0]));
  }
  return total;
}
