import type { IDepartmentFolderPolicy } from '../interfaces/IDepartmentFolders';
import { validateDepartmentFolderPolicy } from '../interfaces/IDepartmentFolders';
/** Writes directly into pre-provisioned secured folders: never creates in the list root or fixes ACLs after saving. */
export class DepartmentFolderStore {
  public constructor(private siteUrl:string,private token:()=>Promise<string>,public policy:IDepartmentFolderPolicy,private currentUserId:number,private currentEmail:string,private canSubmitForOthers:boolean){validateDepartmentFolderPolicy(policy);const prefix=new URL(siteUrl).pathname.replace(/\/$/,'')+'/';if(![policy.ticketRoot,policy.commentRoot].every(path=>path.startsWith(prefix)))throw new Error('Department roots must belong to the configured site.');}
  private async request(path:string,body?:unknown):Promise<unknown>{
    const url=new URL(path,this.siteUrl+'/');if(url.origin!==new URL(this.siteUrl).origin || !url.pathname.startsWith(new URL(this.siteUrl).pathname.replace(/\/$/,'')+'/_api/'))throw new Error('Unexpected SharePoint folder API address.');
    const response=await fetch(url.href,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+await this.token(),Accept:'application/json;odata=nometadata',...(body!==undefined?{'Content-Type':'application/json;odata=nometadata'}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('Secured folder request failed ('+response.status+'). Ask a site owner to provision department/requester folders.');
    return response.json();
  }
  private api(path:string):string{return this.siteUrl.replace(/\/$/,'')+'/_api/web/'+path;}
  private list(id:string):string{if(!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))throw new Error('Invalid folder list ID.');return this.api("lists(guid'"+id+"')");}
  private async create(listId:string,folder:string,fields:Record<string,unknown>):Promise<{id:string}>{
    const root=this.siteUrl.replace(/\/$/,'');const origin=new URL(root).origin;
    // Confirm the secured destination exists and is accessible before creating anything.
    const destination=await this.request(this.api("GetFolderByServerRelativePath(decodedUrl='"+encodeURIComponent(folder.replace(/'/g,"''"))+"')?$select=Exists")) as {Exists?:boolean};
    if(destination.Exists===false)throw new Error('The secured requester folder has not been provisioned.');
    const columns=await this.request(this.list(listId)+'/'+ 'fields?$select=InternalName,TypeAsString') as {value:Array<{InternalName:string;TypeAsString:string}>};
    const formValues=await Promise.all(Object.entries(fields).filter(([,value])=>value!==undefined && value!==null).map(async([name,value])=>{
      const field=name.replace(/LookupId$/,'');const column=columns.value.find(item=>item.InternalName===field);
      if(column?.TypeAsString==='User'){
        const id=Number(value);if(!Number.isSafeInteger(id)||id<1)throw new Error('Invalid person field.');
        const user=await this.request(this.api('siteusers/getbyid('+id+')?$select=LoginName')) as {LoginName:string};
        if(!user.LoginName)throw new Error('SharePoint user could not be resolved.');
        return {FieldName:field,FieldValue:JSON.stringify([{Key:user.LoginName}])};
      }
      return {FieldName:field,FieldValue:String(value)};
    }));
    const values=await this.request(this.list(listId)+'/AddValidateUpdateItemUsingPath',{listItemCreateInfo:{FolderPath:{DecodedUrl:origin+folder},UnderlyingObjectType:0},formValues,bNewDocumentUpdate:false}) as {value:Array<{FieldName:string;FieldValue:string;HasException:boolean;ErrorMessage?:string}>};
    if(!Array.isArray(values.value))throw new Error('SharePoint returned an invalid secured-create response. Refresh before retrying.');
    const failure=values.value.find(value=>value.HasException);if(failure)throw new Error(failure.ErrorMessage || 'Secured item validation failed.');
    const id=values.value.find(value=>value.FieldName==='Id' || value.FieldName==='ID')?.FieldValue;if(!id || !/^[1-9]\d*$/.test(id))throw new Error('Secured save returned no item ID. Refresh before retrying.');return {id};
  }
  public async createTicket(listId:string,fields:Record<string,unknown>,department:string,email?:string):Promise<{id:string}>{
    const entry=this.policy.departments.find(item=>item.key===department || item.name===department);if(!entry)throw new Error('Choose a configured department.');
    let owner=this.currentUserId;
    if(email && email.toLowerCase()!==this.currentEmail.toLowerCase()){
      if(!this.canSubmitForOthers)throw new Error('Requesters can submit only their own requests.');
      const user=await this.request(this.api("siteusers/getbyemail('"+encodeURIComponent(email.replace(/'/g,"''"))+"')?$select=Id")) as {Id:number};owner=user.Id;
    }
    if(!Number.isSafeInteger(owner) || owner<1)throw new Error('A valid requester is required.');
    return this.create(listId,this.policy.ticketRoot+'/Departments/'+entry.key+'/Requesters/'+owner,fields);
  }
  public async createComment(ticketListId:string,ticketId:number,commentListId:string,fields:Record<string,unknown>):Promise<{id:string}>{
    if(!Number.isSafeInteger(ticketId) || ticketId<1)throw new Error('Invalid ticket.');
    const ticket=await this.request(this.list(ticketListId)+'/items('+ticketId+')?$select=FileDirRef') as {FileDirRef:string};
    const prefix=this.policy.ticketRoot+'/Departments/';if(!ticket.FileDirRef?.startsWith(prefix))throw new Error('This ticket has not been migrated into a secured department folder.');
    const relative=ticket.FileDirRef.slice(prefix.length);if(!/^[-a-z0-9]{1,64}\/Requesters\/[1-9]\d*$/.test(relative) || !this.policy.departments.some(item=>relative.startsWith(item.key+'/')))throw new Error('Invalid ticket security location.');
    return this.create(commentListId,this.policy.commentRoot+'/Departments/'+relative,fields);
  }
}
