import {randomUUID} from 'node:crypto';
import {ApiError} from './tokens.mjs';
export function handler({config,validate,createServices,dispatch,log=console.error}){
  return async(request,response)=>{
    const requestId=randomUUID();
    response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('X-Request-ID',requestId);response.setHeader('Vary','Origin');
    const send=(status,body)=>{response.writeHead(status,{'Content-Type':'application/json'});response.end(JSON.stringify(body));};
    try{
      const origin=request.headers.origin;
      if(origin&&!config.origins.includes(origin))throw new ApiError('Untrusted origin.');
      if(origin){response.setHeader('Access-Control-Allow-Origin',origin);response.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');response.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');response.setHeader('Access-Control-Expose-Headers','X-Request-ID');}
      if(request.url!=='/api/rpc')return send(404,{error:'Not found'});
      if(request.method==='OPTIONS'){response.writeHead(204);return response.end();}
      if(request.method!=='POST')return send(405,{error:'Use POST'});
      const assertion=request.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];if(!assertion)throw new ApiError('Sign in to DeskPilot.',401);
      const claims=await validate(assertion);
      if(!String(request.headers['content-type']).startsWith('application/json'))throw new ApiError('JSON is required.',415);
      let length=0;const chunks=[];
      for await(const chunk of request){length+=chunk.length;if(length>72*1024*1024)throw new ApiError('Request too large.',413);chunks.push(chunk);}
      let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ApiError('Invalid JSON.',400);}
      if(!body||typeof body.method!=='string'||!Array.isArray(body.args)||body.args.length>4)throw new ApiError('Invalid API request.',400);
      const result=await dispatch(await createServices(assertion,claims),body.method,body.args);
      return send(200,{result:result??null});
    }catch(error){
      if(['ConnectionError','RequestError'].includes(error.name))error=new ApiError('Database operation failed. Ask your administrator to check the backend connection and schema.',503);
      const status=error instanceof ApiError?error.status:400;
      // Never log request bodies, tokens, credentials or ticket content.
      log(JSON.stringify({requestId,status,errorType:error.name}));
      return send(status,{error:error.message||'DeskPilot request failed.',requestId,...(Number.isSafeInteger(error.createdTicketId)?{createdTicketId:error.createdTicketId}:{})});
    }
  };
}
