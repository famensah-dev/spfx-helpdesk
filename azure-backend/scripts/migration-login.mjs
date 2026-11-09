import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { ApiError } from '../src/tokens.mjs';

/** Interactive operator login with PKCE; tokens are never printed or written to disk. */
export async function migrationLogin(config, clientId) {
  if (!config.clients.some(id=>id.toLowerCase()===String(clientId).toLowerCase())) throw new ApiError('Add the migration client ID to the local allowed-client list before signing in.',400);
  const verifier=randomBytes(48).toString('base64url'),state=randomBytes(32).toString('base64url');
  const challenge=createHash('sha256').update(verifier).digest('base64url');
  const server=createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const redirect='http://localhost:'+server.address().port;
  const authority=`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0`;
  const scope=`api://${config.clientId}/access_as_user`;
  const url=new URL(authority+'/authorize');
  url.search=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:redirect,response_mode:'query',scope,state,code_challenge:challenge,code_challenge_method:'S256',prompt:'select_account'}).toString();
  let timer;
  try {
    const pending=new Promise((resolve,reject)=>{
      timer=setTimeout(()=>reject(new ApiError('Migration sign-in timed out.',401)),10*60000);
      server.on('request',(request,response)=>{
        const callback=new URL(request.url,redirect);
        if(request.method!=='GET'||callback.pathname!=='/'||callback.searchParams.get('state')!==state){response.writeHead(400);response.end('Invalid sign-in response.');return;}
        const code=callback.searchParams.get('code');
        response.writeHead(code?200:400,{'Content-Type':'text/plain','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
        response.end(code?'DeskPilot migration sign-in complete. You can close this tab.':'Sign-in failed. Return to the terminal.');
        if(code)resolve(code);else reject(new ApiError('Migration sign-in was denied.',401));
      });
    });
    console.log('Open this Microsoft sign-in link in your browser using your DeskPilot Super Admin account:\n'+url.href);
    const code=await pending;
    const response=await fetch(authority+'/token',{method:'POST',body:new URLSearchParams({client_id:clientId,grant_type:'authorization_code',code,redirect_uri:redirect,code_verifier:verifier,scope}),signal:AbortSignal.timeout(30000)});
    const result=await response.json();
    if(!response.ok||!result.access_token)throw new ApiError('Migration sign-in could not obtain a DeskPilot API token. Check client registration and consent.',401);
    return result.access_token;
  } finally {clearTimeout(timer);await new Promise(resolve=>server.close(resolve));}
}
