import {ApiError} from './tokens.mjs';
import {signReview,verifyReview} from './review.mjs';
const methods=[
  'storageManagement.get','storageManagement.save',
  'getTickets','getPriorities','getCreationOptions','createTicket','getAttachments','uploadAttachments','uploadCommentAttachments','updateTicket','updateTickets','deleteArchivedTickets','getComments','addComment','getHistory','recordFirstResponse','markCommentAsSolution','searchUsers','resolveUser','getTeamCandidates','getFaqs','getFaqAccess','saveFaq','deleteFaq','updateFaqs','saveWorkspaceSettings',
  'ticketViews.getOpened','ticketViews.markOpened',
  'supportUnits.load','supportUnits.createUnits','supportUnits.setAutoAssignment','supportUnits.setTeamLead','supportUnits.saveUnit','supportUnits.saveMember','supportUnits.routeTicket',
  'notifications.getSettings','notifications.saveSettings','notifications.history','notifications.inbox','notifications.test','notifications.invite',
  'administration.getData','administration.getLookupColumns','administration.saveColumn','administration.deleteColumn','administration.saveEntry','administration.deleteEntry',
  'sla.getSettings','sla.savePriority','sla.saveClockRules','sla.setup','sla.checkBreaches',
  'roleManagement.load','roleManagement.save','workspaceSetup.inspect','workspaceSetup.run',
  'workspaceMaintenance.lists','workspaceMaintenance.inspect','workspaceMaintenance.run'
];
export function metadata(service) {
  return {access:service.access,roleRules:service.roleRules,workspaceSettings:service.workspaceSettings,workspaceConnection:service.workspaceConnection,
    capabilities:[...methods.filter(method=>typeof locate(service,method)?.fn==='function'),'getProfilePhoto',...(service.access?.superAdmin?['readWorkspaceResource']:[])],notificationManagement:Boolean(service.notifications?.canManage)};
}
function locate(service,method){const parts=method.split('.');const owner=parts.length===1?service:service[parts[0]];return owner?{owner,fn:owner[parts.at(-1)]}:undefined;}
function files(values){
  if(values===undefined)return [];
  if(!Array.isArray(values)||values.length>10)throw new ApiError('Select up to ten attachments.',400);
  return values.map(value=>{
    if(!value||typeof value.name!=='string'||!value.name||/[\/\\\r\n]/.test(value.name)||typeof value.data!=='string'||value.data.length>7*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(value.data))throw new ApiError('Invalid attachment.',400);
    const bytes=Buffer.from(value.data,'base64');if(bytes.length>5*1024*1024)throw new ApiError('Each attachment must be at most 5 MB.',413);
    return new File([bytes],value.name,{type:typeof value.type==='string'?value.type:''});
  });
}
export async function dispatch({service,graph,profile,readWorkspaceResource,getProfilePhoto,reviewSecret},method,args) {
  args=args.map(value=>value===null?undefined:value);
  if(method==='session')return metadata(service);
  if(method==='getProfilePhoto')return getProfilePhoto();
  if(method==='readWorkspaceResource'){
    if(!service.access?.superAdmin)throw new ApiError('Super Admin access is required.');
    return readWorkspaceResource(args[0]);
  }
  if(!methods.includes(method))throw new ApiError('Unknown API operation.',404);
  const operation=locate(service,method);
  if(typeof operation?.fn!=='function')throw new ApiError('This operation is not available for your workspace role.');
  const superOnly=['deleteArchivedTickets','saveWorkspaceSettings','roleManagement.load','roleManagement.save','workspaceSetup.inspect','workspaceSetup.run','administration.getLookupColumns','administration.saveColumn','administration.deleteColumn','sla.setup'];
  if(superOnly.includes(method)&&!service.access?.superAdmin)throw new ApiError('Super Admin access is required.');
  if(method.startsWith('workspaceMaintenance.')&&!service.access?.superAdmin)throw new ApiError('Super Admin access is required.');
  if(method.startsWith('storageManagement.')&&!service.access?.superAdmin)throw new ApiError('Super Admin access is required.');
  if((method.startsWith('supportUnits.')||['notifications.getSettings','notifications.saveSettings','notifications.history','notifications.test','notifications.invite'].includes(method))&&!service.access?.admin)throw new ApiError('Helpdesk Admin access is required.');
  if(method==='administration.getData'&&args[0]==='schema'&&!service.access?.superAdmin)throw new ApiError('Super Admin access is required.');
  if(['administration.saveEntry','administration.deleteEntry'].includes(method)&&!['categories','subcategories','issueTypes'].includes(args[0]))throw new ApiError('Invalid classification page.',400);
  if(method==='administration.getData'&&!['schema','categories','subcategories','issueTypes'].includes(args[0]))throw new ApiError('Invalid settings page.',400);
  if(['searchUsers','resolveUser'].includes(method)&&!service.access?.admin&&!service.roleRules?.actions.some(action=>['edit','assign'].includes(action)))throw new ApiError('Your role cannot search the organization directory.');
  if(method==='createTicket'){
    const input=args[0];if(!input||typeof input!=='object')throw new ApiError('Invalid ticket.',400);
    args=[{...input,attachments:files(input.attachments)}];
    if(!service.access?.admin&&!service.roleRules?.actions.includes('edit'))args[0]={...args[0],requesterName:profile.displayName,requesterEmail:profile.mail||profile.userPrincipalName};
  }
  if(['uploadAttachments','uploadCommentAttachments'].includes(method)){const index=method==='uploadAttachments'?1:2;args=[...args];args[index]=files(args[index]);}
  if(method==='addComment')args=[args[0],args[1],args[2]?{html:args[2].html,files:files(args[2].files),requestId:args[2].requestId}:undefined];
  if(method==='resolveUser'){
    const id=args[0]?.id;if(!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id||''))throw new ApiError('Select a directory user.',400);
    const user=await graph.get(`/users/${id}?$select=id,displayName,mail,userPrincipalName`);
    args=[{id:user.id,displayName:user.displayName,email:user.mail||user.userPrincipalName,userPrincipalName:user.userPrincipalName}];
  }
  if(method==='ticketViews.getOpened'){
    if(!Array.isArray(args[0])||args[0].length>5000)throw new ApiError('Invalid ticket view request.',400);
    const allowed=new Set((await service.getTickets()).tickets.map(ticket=>ticket.Id));args=[args[0].filter(id=>allowed.has(id))];
  }
  if(method==='sla.checkBreaches')args=[(await service.getTickets()).tickets]; // Never trust caller-supplied ticket data.
  if(method==='updateTickets'&&(!Array.isArray(args[0])||args[0].length>200))throw new ApiError('Select up to 200 tickets.',400);
  if(method==='workspaceSetup.run'){const progress=[];await operation.fn.call(operation.owner,message=>progress.push(message));return {progress};}
  if(method==='roleManagement.load'){
    const configuration=await operation.fn.call(operation.owner);
    return {configuration,versionToken:signReview(reviewSecret,service.access.oid,'roles.save',[],[configuration],Date.now(),1800000)};
  }
  if(method==='roleManagement.save'){
    const current=await operation.owner.load();
    verifyReview(reviewSecret,args[1],service.access.oid,'roles.save',[],[current]);
    await operation.fn.call(operation.owner,args[0]);
    const saved=await operation.owner.load();
    return {versionToken:signReview(reviewSecret,service.access.oid,'roles.save',[],[saved],Date.now(),1800000)};
  }
  if(method==='workspaceMaintenance.inspect'){
    const targets=await operation.fn.apply(operation.owner,args);
    return {targets,reviewToken:signReview(reviewSecret,service.access.oid,args[0],args[1],targets)};
  }
  if(method==='workspaceMaintenance.run'){
    const targets=await service.workspaceMaintenance.inspect(args[0],args[1]);
    verifyReview(reviewSecret,args[3],service.access.oid,args[0],args[1],targets);
    const progress=[];await operation.fn.call(operation.owner,args[0],args[1],args[2],(message,status)=>progress.push({message,status}));return {progress};
  }
  return operation.fn.apply(operation.owner,args);
}
