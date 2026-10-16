import { jwtVerify } from 'jose';
import { AccessError } from './authorization.mjs';
export async function validateToken(assertion, keys, tenantId, clientId) {
  let claims;
  try {({payload: claims} = await jwtVerify(assertion, keys, {issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`, audience: clientId, algorithms: ['RS256'], requiredClaims: ['exp', 'tid', 'oid', 'azp', 'scp'], clockTolerance: 30}));} catch {throw new AccessError('Invalid or expired DeskPilot API token. Sign out and sign in again.', 401);}
  if (claims.tid?.toLowerCase() !== tenantId.toLowerCase() || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(claims.oid || '') || claims.azp !== clientId || typeof claims.scp !== 'string' || !claims.scp.split(' ').includes('access_as_user')) throw new AccessError('Invalid DeskPilot user token.', 401);
  return claims;
}
