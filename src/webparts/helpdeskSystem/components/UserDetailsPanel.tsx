import * as React from 'react';
import { MessageBar, MessageBarType, Panel, PanelType, PersonaCoin, PersonaSize, Spinner } from '@fluentui/react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import type { IRoleAssignment, IRoleConfiguration, RoleAction } from '../interfaces/IRoleManagement';
import type { ISupportUnitData } from '../interfaces/ISupportUnits';
import styles from './HelpdeskSystem.module.scss';

const actionLabels: Record<RoleAction,string> = {
  dashboard:'View Dashboard', tickets:'View Tickets', faqs:'Read Published Knowledge Base',
  create:'Create Tickets', edit:'Edit Tickets and Attachments', status:'Change Ticket Status',
  assign:'Assign Tickets', priority:'Change Priority', archive:'Archive Tickets', comment:'Add Comments',
  manageFaqs:'Manage Knowledge Base', classifications:'Manage Categories and Issue Types', sla:'Manage Priorities and SLA'
};

export function UserDetailsPanel(props:{user?:IRoleAssignment; configuration:IRoleConfiguration; service:ITicketDataSource; onDismiss:()=>void}):React.ReactElement {
  const [teams,setTeams]=React.useState<ISupportUnitData>();
  const [loading,setLoading]=React.useState(false);
  const [error,setError]=React.useState('');
  const user=props.user;
  React.useEffect(()=>{
    let active=true; setTeams(undefined); setError(''); setLoading(false);
    if(!user || !props.service.supportUnits)return;
    setLoading(true);
    props.service.supportUnits.load().then(value=>{if(active)setTeams(value);}).catch(reason=>{
      if(active)setError(reason instanceof Error?reason.message:'Unable to load support teams.');
    }).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[user?.userId,props.service]);
  const role=props.configuration.roles.find(item=>item.id===user?.roleId);
  const memberships=teams?.members.filter(member=>member.userId===user?.userId) || [];
  const scope=role?.scope==='own'?'Their own requests':role?.scope==='assigned'?'Tickets assigned to them':role?.scope==='assignedOrCreated'?'Tickets assigned to them or created by them':role?.scope==='newUnassigned'?'All New tickets without an assignee':role?.scope==='all'?'All tickets allowed by SharePoint access':'Not configured';
  return <Panel isOpen={Boolean(user)} onDismiss={props.onDismiss} headerText="User Details" closeButtonAriaLabel="Close user details" type={PanelType.smallFixedFar}>
    {user && <div className={styles.userDetailsProfile}>
      <div className={styles.userDetailsIdentity}><PersonaCoin text={user.name} size={PersonaSize.size48} /><div><h3>{user.name}</h3><span>{user.email}</span></div></div>
      <dl className={styles.userDetailsFields}>
        <dt>Department</dt><dd>{user.department || 'Not provided'}</dd>
        <dt>DeskPilot Role</dt><dd>{role?.name || user.roleId}</dd>
        <dt>DeskPilot Access</dt><dd>{user.disabled?'Inactive':'Active'}</dd>
        <dt>Date Added</dt><dd>{user.addedAt && Number.isFinite(Date.parse(user.addedAt))?new Date(user.addedAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}):'Not recorded'}</dd>
        <dt>Ticket Visibility</dt><dd>{scope}</dd>
      </dl>
      <h3>Support Teams</h3>
      {loading?<Spinner label="Loading support teams..." />:error?<MessageBar messageBarType={MessageBarType.warning}>{error}</MessageBar>:!props.service.supportUnits?<p>Support team details are unavailable with your current access.</p>:!memberships.length?<p>No support team memberships.</p>:<ul className={styles.userDetailsTeams}>{memberships.map(member=>{
        const team=teams!.units.find(item=>item.id===member.unitId);
        const categories=teams!.categories.filter(item=>team?.categoryIds.includes(item.id));
        return <li key={member.id}><strong>{team?.title || 'Team #'+member.unitId}</strong>{team?.teamLeadMemberId===member.id && <span>Team Lead</span>}{team && <small>{team.active?'Active team':'Inactive team'}{team.email?' · '+team.email:''}</small>}{categories.length>0 && <small>Categories: {categories.map(item=>item.title).join(', ')}</small>}</li>;
      })}</ul>}
      <h3>Role Permissions</h3>
      {user.disabled?<p>The assigned DeskPilot role is inactive.</p>:<ul>{role?.actions.map(action=><li key={action}>{actionLabels[action]}</li>)}</ul>}
      <p className={styles.userDetailsNote}>This shows the saved DeskPilot assignment and configured role. SharePoint permissions and other group memberships also determine effective access.</p>
    </div>}
  </Panel>;
}
