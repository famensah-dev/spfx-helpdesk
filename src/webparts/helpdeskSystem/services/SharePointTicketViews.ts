import type { ITicketViews } from '../interfaces/ITicketViews';
import type { GraphClient } from './graph/GraphClient';
import { deskPilotGroups } from './SharePointGroupAccess';
interface Receipt {Id:number;Title:string;AuthorId:number;LastOpenedAt?:string;}
const guid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export class SharePointTicketViews implements ITicketViews {
  private ready?:Promise<{id:string;path:string;graphPath:string}>;
  private cache=new Map<number,{opened:boolean;expires:number;revision:number}>();
  private revision=0;
  private boundTicketList?:Promise<string>;
  private pending=new Map<number,Promise<void>>();
  private listeners=new Set<()=>void>();
  public constructor(private siteUrl:string,private token:()=>Promise<string>,private graph:GraphClient,private userId:number,private ticketListId:()=>Promise<string>,private listId?:string){}
  private async request(path:string,method='GET',body?:unknown,extra?:Record<string,string>):Promise<Response>{
    const url=new URL(path);const site=new URL(this.siteUrl);if(url.origin!==site.origin || !url.pathname.startsWith(site.pathname.replace(/\/$/,'')+'/_api/'))throw new Error('Unexpected ticket view API address.');
    return fetch(url.href,{method,headers:{Authorization:'Bearer '+await this.token(),Accept:'application/json;odata=nometadata',...(body===undefined?{}:{'Content-Type':'application/json;odata=nometadata'}),...extra},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  }
  private web():string{return this.siteUrl.replace(/\/$/,'')+'/_api/web';}
  private async failure(response:Response,operation:string):Promise<Error>{
    let detail='';
    try {
      const body=await response.json();
      const error=body['odata.error'] || body.error;
      const message=typeof error?.message==='string'?error.message:error?.message?.value;
      detail=[error?.code,message].filter(value=>typeof value==='string').join(': ').slice(0,1500);
    } catch { /* Some SharePoint failures return HTML rather than JSON. */ }
    const requestId=response.headers.get('SPRequestGuid') || response.headers.get('request-id');
    return new Error(operation+' (HTTP '+response.status+').'+(detail?' '+detail:' SharePoint did not return a JSON error message.')+(requestId?' Request ID: '+requestId:''));
  }
  private async json<T>(path:string):Promise<T>{const response=await this.request(path);if(!response.ok)throw new Error('Ticket view tracking is unavailable ('+response.status+'). Ask a Super Admin to run Initialize workspace.');return response.json();}
  private schema():Promise<{id:string;path:string;graphPath:string}>{
    if(!this.ready)this.ready=(async()=>{
      if(!Number.isSafeInteger(this.userId)||this.userId<1)throw new Error('A signed-in SharePoint user is required.');
      const list=await this.json<{Id:string;ReadSecurity:number;WriteSecurity:number}>(this.web()+(this.listId && guid.test(this.listId)?"/lists(guid'"+this.listId+"')":"/lists/getbytitle('DeskPilot Ticket Views')")+'?$select=Id,ReadSecurity,WriteSecurity');
      if(list.ReadSecurity!==2 || list.WriteSecurity!==2)throw new Error('Ticket view privacy is not configured. Ask a Super Admin to run Initialize workspace.');
      const path=this.web()+"/lists(guid'"+list.Id+"')";
      const field=await this.json<{Indexed:boolean;EnforceUniqueValues:boolean}>(path+"/fields/getbyinternalnameortitle('Title')?$select=Indexed,EnforceUniqueValues");
      if(!field.Indexed)throw new Error('Ticket view tracking requires an indexed key. Run Initialize workspace.');
      const site=new URL(this.siteUrl);const info=await this.graph.get<{id:string}>('/sites/'+site.hostname+':'+site.pathname+'?$select=id');
      return {id:list.Id,path,graphPath:'/sites/'+encodeURIComponent(info.id)+'/lists/'+encodeURIComponent(list.Id)};
    })().catch(error=>{this.ready=undefined;throw error;});
    return this.ready;
  }
  private async key(ticketId:number):Promise<string>{if(!Number.isSafeInteger(ticketId)||ticketId<1)throw new Error('Invalid ticket ID.');if(!this.boundTicketList)this.boundTicketList=this.ticketListId().catch(reason=>{this.boundTicketList=undefined;throw reason;});const list=await this.boundTicketList;if(!guid.test(list))throw new Error('Ticket list is not configured.');return this.userId+':'+list.toLowerCase()+':'+ticketId;}
  public subscribe(listener:()=>void):()=>void{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
  public async getOpened(ticketIds:number[]):Promise<number[]>{
    const ids=[...new Set(ticketIds)];if(ids.length>100 || ids.some(id=>!Number.isSafeInteger(id)||id<1))throw new Error('Check at most 100 valid visible tickets at a time.');
    if(!ids.length)return [];
    const schema=await this.schema();const missing=ids.filter(id=>!this.cache.has(id) || this.cache.get(id)!.expires<Date.now());
    // Indexed key queries return at most two matching receipts; concurrent duplicates also mean opened.
    for(let offset=0;offset<missing.length;offset+=20){
      const group=missing.slice(offset,offset+20);const keys=await Promise.all(group.map(id=>this.key(id)));const revision=this.revision;
      const response=await this.graph.post<{responses:Array<{id:string;status:number;body:{value?:Array<{fields:{Title?:string;AuthorLookupId?:string}}>;error?:unknown}}>}>('/$batch',{requests:group.map((id,index)=>({id:String(id),method:'GET',url:schema.graphPath+'/items?$expand=fields($select=Title,AuthorLookupId)&$filter='+encodeURIComponent("fields/Title eq '"+keys[index]+"'")+'&$top=2'}))});
      for(let index=0;index<group.length;index++){
        const id=group[index];const part=response.responses?.find(item=>item.id===String(id));if(!part || part.status!==200 || !Array.isArray(part.body?.value))throw new Error('Could not confirm opened tickets. Try again later.');
        const rows=part.body.value;if(rows.some(row=>row.fields.Title!==keys[index] || Number(row.fields.AuthorLookupId)!==this.userId))throw new Error('Ticket view ownership could not be confirmed.');
        if((this.cache.get(id)?.revision || 0)<=revision)this.cache.set(id,{opened:!!rows.length,expires:Date.now()+(rows.length?300000:30000),revision});
      }
    }
    return ids.filter(id=>this.cache.get(id)?.opened);
  }
  private async find(path:string,key:string):Promise<Receipt|undefined>{
    const data=await this.json<{value:Receipt[]}>(path+'/items?$select=Id,Title,AuthorId,LastOpenedAt&$filter='+encodeURIComponent("Title eq '"+key+"'")+'&$top=2');
    if(data.value.some(row=>row.Title!==key || row.AuthorId!==this.userId))throw new Error('Ticket view ownership could not be confirmed.');return data.value[0];
  }
  public markOpened(ticketId:number):Promise<void>{
    const existing=this.pending.get(ticketId);if(existing)return existing;
    const work=this.save(ticketId).finally(()=>{this.pending.delete(ticketId);});this.pending.set(ticketId,work);return work;
  }
  private async save(ticketId:number):Promise<void>{
    const key=await this.key(ticketId);const schema=await this.schema();let receipt=await this.find(schema.path,key);const now=new Date().toISOString();
    if(!receipt){
      const response=await this.request(schema.path+'/items','POST',{Title:key,LastOpenedAt:now});
      if(!response.ok){receipt=await this.find(schema.path,key);if(!receipt)throw new Error('Could not save this ticket as opened.');}
    }
    if(receipt && (!receipt.LastOpenedAt || Date.now()-new Date(receipt.LastOpenedAt).getTime()>60000)){
      const response=await this.request(schema.path+'/items('+receipt.Id+')','POST',{LastOpenedAt:now},{'X-HTTP-Method':'MERGE','IF-MATCH':'*'});if(!response.ok)throw new Error('Could not update the ticket opened time.');
    }
    this.cache.set(ticketId,{opened:true,expires:Date.now()+300000,revision:++this.revision});for(const listener of this.listeners)listener();
  }
  /** Owner-only initialization; uses native own-created-item rules, not a unique ACL per receipt. */
  public async setup(id:string):Promise<void>{
    if(!guid.test(id))throw new Error('Invalid ticket views list.');
    const permission=await this.json<{Low:string}>(this.web()+'/EffectiveBasePermissions');const low=Number(permission.Low);if(!(low & 1073741824)||!(low & 33554432))throw new Error('Ticket view setup requires a site owner.');
    const path=this.web()+"/lists(guid'"+id+"')";
    // SharePoint forbids unique fields on lists that restrict reads to own items.
    // Remove the old constraint before enabling privacy; retain the lookup index.
    const fieldPath=path+"/fields/getbyinternalnameortitle('Title')";
    const field=await this.json<{EnforceUniqueValues:boolean}>(fieldPath+'?$select=EnforceUniqueValues');
    if(field.EnforceUniqueValues){
      const result=await this.request(fieldPath,'POST',{EnforceUniqueValues:false},{'X-HTTP-Method':'MERGE','IF-MATCH':'*'});
      if(!result.ok)throw await this.failure(result,'Unable to remove the incompatible Ticket Views unique constraint');
    }
    const settings=await this.request(path,'POST',{ReadSecurity:2,WriteSecurity:2,EnableVersioning:false,EnableAttachments:false,Hidden:true,OnQuickLaunch:false},{'X-HTTP-Method':'MERGE','IF-MATCH':'*'});if(!settings.ok)throw await this.failure(settings,'Unable to apply Ticket Views list privacy settings');
    const definitions=await this.json<{value:Array<{Id:number;RoleTypeKind:number}>}>(this.web()+'/roledefinitions?$select=Id,RoleTypeKind');const full=definitions.value.find(item=>item.RoleTypeKind===5)?.Id;const contribute=definitions.value.find(item=>item.RoleTypeKind===3)?.Id;if(!full || !contribute)throw new Error('Full Control and Contribute permission levels are required.');
    const owners=await this.json<{Id:number}>(this.web()+'/associatedownergroup?$select=Id');
    const run=async(url:string):Promise<void>=>{const result=await this.request(url,'POST');if(!result.ok)throw await this.failure(result,'Unable to configure Ticket Views permissions');};
    await run(path+'/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=false)');
    const assignments=await this.json<{value:Array<{PrincipalId:number}>}>(path+'/roleassignments?$select=PrincipalId');
    const groups=await this.json<{value:Array<{Id:number;Title:string}>}>(this.web()+'/sitegroups?$select=Id,Title');
    const principals=new Set([this.userId,owners.Id,...groups.value.filter(group=>Object.values(deskPilotGroups).some(name=>name.toLowerCase()===group.Title.toLowerCase())).map(group=>group.Id)]);
    for(const principal of principals){
      if(principal!==this.userId && principal!==owners.Id && assignments.value.some(item=>item.PrincipalId===principal)){const removed=await this.request(path+'/roleassignments/getbyprincipalid('+principal+')','POST',undefined,{'X-HTTP-Method':'DELETE'});if(!removed.ok)throw new Error('Unable to reset ticket view role-group access.');}
      await run(path+'/roleassignments/addroleassignment(principalid='+principal+',roledefid='+(principal===this.userId || principal===owners.Id ? full:contribute)+')');
    }
    for(const assignment of assignments.value)if(!principals.has(assignment.PrincipalId)){const response=await this.request(path+'/roleassignments/getbyprincipalid('+assignment.PrincipalId+')','POST',undefined,{'X-HTTP-Method':'DELETE'});if(!response.ok)throw new Error('Unable to remove obsolete ticket view access.');}
    this.listId=id;this.ready=undefined;this.cache.clear();
  }
}
