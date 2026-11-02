import * as React from 'react';
import type { ITicketViews } from '../interfaces/ITicketViews';
export function useTicketOpened(views:ITicketViews|undefined,ids:number[],refreshKey?:unknown):{opened:Set<number>|undefined;error:string}{
  const key=ids.join(',');
  const [revision,setRevision]=React.useState(0);
  const [state,setState]=React.useState<{key:string;opened:Set<number>}>();
  const [error,setError]=React.useState('');
  React.useEffect(()=>views?.subscribe?.(()=>setRevision(value=>value+1)),[views]);
  React.useEffect(()=>{
    let active=true;setError('');
    if(!views){setState(undefined);return;}
    const requested=key ? key.split(',').map(Number) : [];
    views.getOpened(requested).then(result=>{if(active)setState({key,opened:new Set(result)});}).catch(reason=>{if(active){setState(undefined);setError(reason instanceof Error ? reason.message : 'Opened-ticket tracking is unavailable.');}});
    return()=>{active=false;};
  },[views,key,revision,refreshKey]);
  React.useEffect(()=>{const refresh=():void=>{if(document.visibilityState!=='hidden')setRevision(value=>value+1);};window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[]);
  return {opened:state?.key===key ? state.opened : undefined,error};
}
