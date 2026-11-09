import sql from 'mssql';
import { ApiError } from '../../tokens.mjs';
import { SqlRepository } from './repository.mjs';
export { captureSharePoint, verifyStaged } from '../migration.mjs';

/** Offline migration only. One pinned connection keeps IDENTITY_INSERT and locks in one session. */
export async function stageSqlMigration({pool, workspace, snapshot, attachments, profileId, verifySource, driver = sql}) {
  const transaction = new driver.Transaction(pool), uploaded = [];
  const request = () => new driver.Request(transaction);
  let begun = false, identityInsert = false, commitAttempted = false, committed = false;
  try {
    await transaction.begin(driver.ISOLATION_LEVEL.SERIALIZABLE); begun = true;
    const occupied = await request().input('workspace', driver.NVarChar(64), workspace)
      .query('SELECT TOP(1) Id FROM deskpilot.Records WITH (TABLOCKX,HOLDLOCK) WHERE WorkspaceId=@workspace');
    if (occupied.recordset.length) throw new ApiError('The destination workspace is not empty. No data was overwritten.',409);
    await request().query('SET IDENTITY_INSERT deskpilot.Records ON'); identityInsert = true;
    for (const row of snapshot.records) {
      await request().input('workspace',driver.NVarChar(64),workspace).input('kind',driver.NVarChar(32),row.kind)
        .input('id',driver.BigInt,row.id).input('parent',driver.BigInt,row.parent)
        .input('document',driver.NVarChar(driver.MAX),JSON.stringify(row.document))
        .query("INSERT deskpilot.Records(WorkspaceId,Kind,Id,ParentId,OwnerId,Document) VALUES(@workspace,@kind,@id,@parent,'',@document)");
    }
    // Explicit inserts above advance the identity counter when their IDs exceed its current value.
    await request().query('SET IDENTITY_INSERT deskpilot.Records OFF'); identityInsert = false;
    const repository = new SqlRepository({request},workspace);
    for (const file of snapshot.files) {
      const stored = await attachments.upload(file.ticketId,new File([file.bytes],file.name)); uploaded.push(stored);
      await attachments.verify(stored,file.hash);
      await repository.insert('attachment',{...stored,author:file.author,created:file.created || stored.created,commentId:file.commentId,hash:file.hash},file.ticketId);
    }
    if (await verifySource() !== snapshot.digest) throw new ApiError('SharePoint changed during the copy. Freeze writes and retry.',409);
    const actual = await request().input('workspace',driver.NVarChar(64),workspace)
      .query('SELECT Kind,COUNT(*) AS Total FROM deskpilot.Records WHERE WorkspaceId=@workspace GROUP BY Kind');
    for (const [kind,count] of Object.entries(snapshot.counts)) if (Number(actual.recordset.find(row=>row.Kind===kind)?.Total || 0)!==count) throw new ApiError('Migration row counts did not match.',409);
    // Verify the stored records and file bytes before committing, not just their counts.
    await repository.insert('migration',{digest:snapshot.digest,counts:snapshot.counts,profileId,state:'staged',created:new Date().toISOString()});
    const {verifyStaged}=await import('../migration.mjs');
    await verifyStaged({repository,snapshot,attachments,profileId});
    commitAttempted = true; await transaction.commit(); committed = true;
    return {counts:snapshot.counts,digest:snapshot.digest};
  } finally {
    if (!committed && begun) {
      // Restore session state before releasing the migration connection back to a pool.
      let identityReset = !identityInsert;
      if (identityInsert) { try {await request().query('SET IDENTITY_INSERT deskpilot.Records OFF');identityReset=true;} catch {} }
      let rolledBack = false;
      try {await transaction.rollback();rolledBack=true;} catch {}
      // A lost commit or unconfirmed rollback must not delete potentially committed files.
      if (!commitAttempted && rolledBack) {
        const cleanup=await Promise.allSettled(uploaded.map(file=>attachments.remove(file)));
        if(cleanup.some(result=>result.status==='rejected'))console.error('Migration rolled back, but some unreferenced blobs require administrator cleanup.');
      } else if(uploaded.length) console.error('Migration outcome could not be confirmed. Blobs were retained; verify the staged copy before retrying.');
      if(!identityReset) {await pool.close().catch(()=>{});console.error('The migration connection pool was closed because session cleanup could not be confirmed.');}
    }
  }
}
