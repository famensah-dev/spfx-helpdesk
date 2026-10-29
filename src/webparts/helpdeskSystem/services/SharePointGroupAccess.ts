import { SPHttpClient } from '@microsoft/sp-http';
import type { WebPartContext } from '@microsoft/sp-webpart-base';
import type { IRoleAssignment } from '../interfaces/IRoleManagement';
import type { ISetupPlan } from '../interfaces/IWorkspaceSetup';
import type { IOrganizationUser } from '../interfaces/ITicketDataSource';
export const deskPilotGroups={agent:'DeskPilot Agents',admin:'DeskPilot Helpdesk Administrator',requester:'DeskPilot Requesters'} as const;
interface Group {Id:number;Title:string;Description?:string;}
const pendingDescription='DeskPilot: Read permission initialization pending.';
export class SharePointGroupAccess {
  private readonly web:string;
  private prepared?:Promise<Group[]>;
  public constructor(private readonly context:WebPartContext){this.web=context.pageContext.web.absoluteUrl.replace(/\/$/,'')+'/_api/web';}
  private async request<T>(url:string,body?:unknown,post=false,merge=false):Promise<T>{
    const options={headers:{Accept:'application/json;odata=nometadata','Content-Type':'application/json;odata=nometadata','odata-version':'',...(merge?{'X-HTTP-Method':'MERGE','IF-MATCH':'*'}:{})},body:body===undefined?undefined:JSON.stringify(body)};
    const response=post?await this.context.spHttpClient.post(url,SPHttpClient.configurations.v1,options):await this.context.spHttpClient.get(url,SPHttpClient.configurations.v1,options);
    if(!response.ok)throw new Error(`SharePoint group access update failed (${response.status}). A site owner must check the DeskPilot groups and reload to retry. Some changes may already have been applied.`);
    if(response.status===204)return undefined as T;
    const text=await response.text();return text?JSON.parse(text) as T:undefined as T;
  }
  private async collection<T>(url:string):Promise<T[]>{
    const values:T[]=[];
    let next:string|undefined=url;
    while(next){const page: {value:T[];'odata.nextLink'?:string;'@odata.nextLink'?:string}=await this.request(next);values.push(...page.value);next=page['odata.nextLink']||page['@odata.nextLink'];}
    return values;
  }
  private async groups():Promise<Group[]>{
    const all=await this.collection<Group>(this.web+'/sitegroups?$select=Id,Title,Description&$top=5000');
    return Object.values(deskPilotGroups).flatMap(name=>{
      const matches=all.filter(group=>group.Title.toLowerCase()===name.toLowerCase());
      if(matches.length>1)throw new Error('Duplicate SharePoint group name: '+name);
      return matches;
    });
  }
  public async inspect():Promise<ISetupPlan['steps']>{
    const groups=await this.groups();
    return Object.values(deskPilotGroups).map(name=>{
      const group=groups.find(item=>item.Title.toLowerCase()===name.toLowerCase());
      return {resource:name,action:!group?'Create SharePoint group with Read permission only':group.Description===pendingDescription?'Complete Read permission initialization':'Reuse SharePoint group; preserve its current permissions'};
    });
  }
  /** Read existing role-group membership only; never expose the private access configuration. */
  public async members():Promise<IOrganizationUser[]>{
    const groups=await this.groups();
    const users=new Map<number,IOrganizationUser>();
    for(const group of groups.filter(item=>item.Title.toLowerCase()!==deskPilotGroups.requester.toLowerCase())){
      const people=await this.collection<{Id:number;Title:string;Email:string;LoginName:string}>(this.web+`/sitegroups/getbyid(${group.Id})/users?$select=Id,Title,Email,LoginName&$top=5000`);
      for(const person of people){
        const login=person.LoginName?.split('|').pop()?.trim();
        if(!login || !Number.isSafeInteger(person.Id) || person.Id<=0)continue;
        users.set(person.Id,{id:'sp:'+person.Id,sharePointId:person.Id,displayName:person.Title||person.Email||login,email:person.Email||login,userPrincipalName:login});
      }
    }
    return [...users.values()].sort((a,b)=>a.displayName.localeCompare(b.displayName));
  }
  public initialize():Promise<Group[]>{
    if(!this.prepared)this.prepared=this.prepare().catch(reason=>{this.prepared=undefined;throw reason;});
    return this.prepared;
  }
  private async createGroup(name:string):Promise<Group>{
    try{
      const created=await this.request<Group>(this.web+'/sitegroups',{Title:name,Description:pendingDescription},true);
      return {...created,Title:name,Description:pendingDescription};
    }catch(reason){
      const existing=(await this.groups()).find(item=>item.Title.toLowerCase()===name.toLowerCase());
      if(!existing)throw reason;
      return existing;
    }
  }
  private async prepare():Promise<Group[]>{
    const groups=await this.groups();
    for(const name of Object.values(deskPilotGroups)){
      const existing=groups.find(item=>item.Title.toLowerCase()===name.toLowerCase());
      const group=existing||await this.createGroup(name);
      if(!existing)groups.push(group);
      if(group.Description===pendingDescription){
        const assignments=await this.collection<{PrincipalId:number}>(this.web+'/roleassignments?$select=PrincipalId&$top=5000');
        if(!assignments.some(item=>item.PrincipalId===group!.Id)){
          const levels=await this.collection<{Id:number;RoleTypeKind:number}>(this.web+'/roledefinitions?$select=Id,RoleTypeKind');
          const read=levels.find(item=>item.RoleTypeKind===2);
          if(!read)throw new Error('SharePoint Read permission level was not found.');
          await this.request(this.web+`/roleassignments/addroleassignment(principalid=${group.Id},roledefid=${read.Id})`,undefined,true);
        }
        await this.request(this.web+`/sitegroups/getbyid(${group.Id})`,{Description:'DeskPilot role access group. Permission levels are managed by the site owner.'},true,true);
      }
    }
    return groups;
  }
  /** Only DeskPilot-managed user assignments are changed; other memberships stay untouched. */
  public async sync(assignments:IRoleAssignment[],previousUserIds:number[]):Promise<void>{
    if(assignments.some(user=>!Number.isSafeInteger(user.userId)||user.userId<=0))throw new Error('Select valid SharePoint users before synchronizing group access.');
    if(!assignments.length&&!previousUserIds.length)return;
    const groups=await this.initialize();
    const members=new Map<number,Set<number>>();
    for(const group of groups)members.set(group.Id,new Set((await this.collection<{Id:number}>(this.web+`/sitegroups/getbyid(${group.Id})/users?$select=Id&$top=5000`)).map(item=>item.Id)));
    const ids=new Set([...previousUserIds,...assignments.map(item=>item.userId)].filter(id=>Number.isSafeInteger(id)&&id>0));
    // Remove obsolete membership first, so a role change cannot leave the old broader group grant.
    for(const id of ids){
      const user=assignments.find(item=>item.userId===id&&!item.disabled);
      const desired=user&&(user.roleId==='agent'||user.roleId==='admin'||user.roleId==='requester')?deskPilotGroups[user.roleId]:undefined;
      for(const group of groups){
        if(group.Title.toLowerCase()!==desired?.toLowerCase()&&members.get(group.Id)!.has(id)){
          await this.request(this.web+`/sitegroups/getbyid(${group.Id})/users/removebyid(${id})`,undefined,true);
          members.get(group.Id)!.delete(id);
        }
      }
    }
    for(const user of assignments.filter(item=>!item.disabled&&(item.roleId==='agent'||item.roleId==='admin'||item.roleId==='requester'))){
      const name=deskPilotGroups[user.roleId as keyof typeof deskPilotGroups];
      const group=groups.find(item=>item.Title.toLowerCase()===name.toLowerCase())!;
      if(members.get(group.Id)!.has(user.userId))continue;
      const person=await this.request<{LoginName:string}>(this.web+`/siteusers/getbyid(${user.userId})?$select=LoginName`);
      if(!person.LoginName)throw new Error('SharePoint did not return a login for '+user.name+'.');
      await this.request(this.web+`/sitegroups/getbyid(${group.Id})/users`,{LoginName:person.LoginName},true);
      members.get(group.Id)!.add(user.userId);
    }
  }
}
