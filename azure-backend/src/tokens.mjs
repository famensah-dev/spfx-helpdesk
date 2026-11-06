import {jwtVerify,createRemoteJWKSet} from 'jose';
export class ApiError extends Error {constructor(message,status=403){super(message);this.status=status;}}
export function tokenValidator(config,keys=createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`))) {
  return async assertion=>{
    let claims;
    try {({payload:claims}=await jwtVerify(assertion,keys,{issuer:`https://login.microsoftonline.com/${config.tenantId}/v2.0`,audience:config.clientId,algorithms:['RS256'],requiredClaims:['exp','tid','oid','azp','scp'],clockTolerance:30}));}
    catch {throw new ApiError('Invalid or expired DeskPilot API token.',401);}
    if(claims.tid?.toLowerCase()!==config.tenantId.toLowerCase()||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(claims.oid||'')||!config.clients.some(client=>client.toLowerCase()===String(claims.azp).toLowerCase())||typeof claims.scp!=='string'||!claims.scp.split(' ').includes('access_as_user'))throw new ApiError('Invalid DeskPilot caller or delegated scope.',401);
    return claims;
  };
}
export function delegatedTokens(config,assertion,request=fetch) {
  const cache=new Map();
  return resource=>{
    if(!['https://graph.microsoft.com',new URL(config.siteUrl).origin].includes(resource))throw new ApiError('Unexpected downstream API.');
    if(!cache.has(resource))cache.set(resource,(async()=>{
      const response=await request(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,{method:'POST',body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion,requested_token_use:'on_behalf_of',scope:resource+'/.default'}),signal:AbortSignal.timeout(30000)});
      const data=await response.json();
      if(!response.ok||!data.access_token)throw new ApiError('Microsoft 365 delegated access failed. Check backend consent and credential configuration.',502);
      return data.access_token;
    })());
    return cache.get(resource);
  };
}
