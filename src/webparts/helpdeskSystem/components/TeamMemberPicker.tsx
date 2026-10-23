import * as React from 'react';
import { Label, MessageBar, MessageBarType, NormalPeoplePicker } from '@fluentui/react';
import type { IPersonaProps } from '@fluentui/react';
import type { IOrganizationUser, ITicketDataSource } from '../interfaces/ITicketDataSource';
type Candidate = IPersonaProps & {user:IOrganizationUser};
export function TeamMemberPicker({service,users,onChange,disabled}:{service:ITicketDataSource;users:IOrganizationUser[];onChange:(users:IOrganizationUser[])=>void;disabled:boolean}):React.ReactElement {
  const [error,setError]=React.useState('');
  const request=React.useRef(0);
  React.useEffect(()=>()=>{request.current++;},[]);
  const search=async(query:string):Promise<Candidate[]>=>{
    const version=++request.current;
    if(query.trim().length<2)return [];
    setError('');
    try {
      if(!service.searchUsers)throw new Error('Organization user search is unavailable.');
      const result=await service.searchUsers(query);
      return version===request.current ? result.filter(user=>!users.some(selected=>selected.id===user.id)).map(user=>({key:user.id,text:user.displayName,secondaryText:user.email,user})) : [];
    }catch(reason){if(version===request.current)setError(reason instanceof Error ? reason.message : 'Unable to search users.');return [];}
  };
  return <div><Label>Members</Label><NormalPeoplePicker selectedItems={users.map(user=>({key:user.id,text:user.displayName,secondaryText:user.email,user}))} disabled={disabled} resolveDelay={300} onResolveSuggestions={search} onChange={items=>onChange((items as Candidate[] || []).map(item=>item.user))} inputProps={{'aria-label':'Select team members',placeholder:'Search and select several people'}} pickerSuggestionsProps={{suggestionsHeaderText:'Organization users',noResultsFoundText:'No matching users'}} onValidateInput={()=>0} />{error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}</div>;
}
