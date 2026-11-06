import {createHmac,timingSafeEqual} from 'node:crypto';
import {ApiError} from './tokens.mjs';
export function signReview(secret,actor,action,ids,targets,now=Date.now(),lifetime=300000){
  const data=Buffer.from(JSON.stringify({actor,action,ids,targets,expires:now+lifetime})).toString('base64url');
  return data+'.'+createHmac('sha256',secret).update(data).digest('base64url');
}
export function verifyReview(secret,token,actor,action,ids,targets,now=Date.now()){
  const [data,signature]=String(token||'').split('.');if(!data||!signature)throw new ApiError('Review this operation before continuing.');
  const expected=createHmac('sha256',secret).update(data).digest(),actual=Buffer.from(signature,'base64url');
  if(expected.length!==actual.length||!timingSafeEqual(expected,actual))throw new ApiError('Invalid maintenance review.');
  let value;try{value=JSON.parse(Buffer.from(data,'base64url').toString('utf8'));}catch{throw new ApiError('Invalid maintenance review.');}
  if(value.expires<now||value.actor!==actor||value.action!==action||JSON.stringify(value.ids)!==JSON.stringify(ids)||JSON.stringify(value.targets)!==JSON.stringify(targets))throw new ApiError('Resources changed or review expired. Review the operation again.');
}
