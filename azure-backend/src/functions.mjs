import {app} from '@azure/functions';
import {Readable} from 'node:stream';
import {JSDOM} from 'jsdom';
import {readConfig} from './config.mjs';
import {tokenValidator} from './tokens.mjs';
import {createServices} from './services.mjs';
import {dispatch} from './dispatch.mjs';
import {handler} from './http.mjs';
import {runWorker} from './worker.mjs';
const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;
const config=readConfig();
const api=handler({config,validate:tokenValidator(config),createServices:(assertion,claims)=>createServices(config,assertion,claims),dispatch});
app.http('rpc',{
  route:'rpc',methods:['POST','OPTIONS'],authLevel:'anonymous',
  handler:async request=>{
    // Keep the body streaming so JWT validation and size limits precede parsing.
    const incoming=request.body?Readable.fromWeb(request.body):Readable.from([]);
    incoming.headers=Object.fromEntries(request.headers.entries());incoming.method=request.method;incoming.url=new URL(request.url).pathname;
    const result={status:200,headers:{},body:''};
    await api(incoming,{setHeader:(key,value)=>{result.headers[key]=value;},writeHead:(status,headers)=>{result.status=status;Object.assign(result.headers,headers);},end:body=>{result.body=body||'';}});
    return result;
  }
});
app.timer('Automation',{
  schedule:process.env.DESKPILOT_AUTOMATION_SCHEDULE||'0 */1 * * * *',runOnStartup:false,useMonitor:true,
  handler:async()=>{await runWorker(config);}
});
