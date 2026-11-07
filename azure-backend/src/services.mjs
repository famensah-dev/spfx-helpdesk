import {createRequire} from 'node:module';
import {ApiError,delegatedTokens} from './tokens.mjs';
import {storageProfiles,selectProfile} from './storage/profiles.mjs';
import {createStorageManagement} from './storage/management.mjs';
import {createSqlProvider,workspaceKey} from './storage/sql/provider.mjs';
import {SqlRepository,sqlPool} from './storage/sql/repository.mjs';
import {BlobAttachments} from './storage/sql/attachments.mjs';
import {createSharePointProvider} from './storage/sharepoint/provider.mjs';
const require=createRequire(import.meta.url);
const {GraphClient}=require('../compiled/services/graph/GraphClient.js');
export async function createServices(config,assertion,claims,request=fetch) {
  const token=delegatedTokens(config,assertion,request);
  const graph=new GraphClient(()=>token('https://graph.microsoft.com'),request);
  const profile=await graph.get('/me?$select=id,displayName,mail,userPrincipalName');
  if(profile.id?.toLowerCase()!==claims.oid.toLowerCase())throw new ApiError('Microsoft 365 identity mismatch.',401);
  const site=new URL(config.siteUrl);
  const spRequest=async(url,method,options={})=>{
    const target=new URL(url);
    const prefix=site.pathname.replace(/\/$/,'')+'/_api/';
    if(target.origin!==site.origin||!target.pathname.startsWith(prefix))throw new ApiError('Refusing an unexpected SharePoint request.');
    const headers=new Headers(options.headers);
    headers.set('Authorization','Bearer '+await token(site.origin));
    headers.set('Accept',headers.get('Accept')||'application/json;odata=nometadata');
    if(options.body!==undefined)headers.set('Content-Type',headers.get('Content-Type')||'application/json;odata=nometadata');
    return request(target.href,{...options,method,headers,signal:AbortSignal.timeout(60000)});
  };
  const context={
    pageContext:{web:{absoluteUrl:config.siteUrl},user:{displayName:profile.displayName,email:profile.mail||profile.userPrincipalName,loginName:profile.userPrincipalName}},
    spHttpClient:{get:(url,_configuration,options)=>spRequest(url,'GET',options),post:(url,_configuration,options)=>spRequest(url,'POST',options)},
    aadTokenProviderFactory:{getTokenProvider:async()=>({getToken:token})}
  };
  // Group roles, own/assigned scopes, setup and mutations use the CURRENT shared services.
  const control=await createSharePointProvider(context,config);
  const profiles=storageProfiles();
  const selected=control.workspaceSettings?.storage||{provider:'sharepoint'};
  let service=control;
  if(selected.provider==='sql'){
    const response=await spRequest(config.siteUrl+ '/_api/web/currentuser?$select=Id','GET');
    if(!response.ok)throw new ApiError('Unable to identify the workspace user.',403);
    const user=await response.json();
    service=await createSqlProvider({config,profile:selectProfile(profiles,selected.connectionId),control,graph,identity:{oid:claims.oid,email:profile.mail||profile.userPrincipalName,name:profile.displayName,userId:(user.d||user).Id},person:async id=>{
      if(!Number.isSafeInteger(id)||id<1)throw new ApiError('Invalid person ID.',400);
      const response=await spRequest(config.siteUrl+'/_api/web/siteusers/getbyid('+id+')?$select=Id,Title,Email','GET');if(!response.ok)throw new ApiError('Person not found.',400);const value=await response.json();return value.d||value;
    }});
  }else if(selected.provider!=='sharepoint')throw new ApiError('Unsupported workspace storage provider.',400);
  if(control.access.superAdmin){
    service.storageManagement=createStorageManagement({control,profiles,openDatabase:async profile=>({repository:new SqlRepository(await sqlPool(profile),workspaceKey(config)),attachments:new BlobAttachments(profile,workspaceKey(config))})});
  }
  if(service.access.oid?.toLowerCase()!==claims.oid.toLowerCase())throw new ApiError('Workspace identity mismatch.',401);
  const readWorkspaceResource=async url=>{
    if(!service.access.superAdmin)throw new ApiError('Super Admin access is required.');
    const address=new URL(url),web=site.pathname.replace(/\/$/,'')+'/_api/web/';
    // Only the settings browser's read-only list/folder resources are exposed.
    if(address.origin!==site.origin||!address.pathname.startsWith(web)||!/^lists(?:$|\?)|^GetFolderByServerRelativePath\(/i.test(address.pathname.slice(web.length)))throw new ApiError('Unsupported settings resource.');
    const response=await spRequest(address.href,'GET');if(!response.ok)throw new ApiError('Unable to read workspace settings ('+response.status+').',response.status);
    return response.json();
  };
  const getProfilePhoto=async()=>{
    const response=await request('https://graph.microsoft.com/v1.0/me/photos/96x96/$value',{headers:{Authorization:'Bearer '+await token('https://graph.microsoft.com')},signal:AbortSignal.timeout(30000)});
    if(response.status===404)return undefined;if(!response.ok)throw new ApiError('Profile photo is unavailable.',response.status);
    const type=response.headers.get('Content-Type')?.split(';')[0];if(!['image/jpeg','image/png','image/gif','image/webp'].includes(type))return undefined;
    const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>1024*1024)return undefined;
    return 'data:'+type+';base64,'+bytes.toString('base64');
  };
  return {service,graph,profile,readWorkspaceResource,getProfilePhoto,reviewSecret:config.clientSecret};
}
