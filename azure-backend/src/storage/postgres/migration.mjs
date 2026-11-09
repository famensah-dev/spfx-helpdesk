import { ApiError } from '../../tokens.mjs';
import { PostgresRepository } from './repository.mjs';
export { captureSharePoint, verifyStaged } from '../migration.mjs';

/** Stage in an empty destination, atomically. Binding is a separate, explicit operation. */
export async function stageMigration({pool, workspace, snapshot, attachments, profileId, verifySource}) {
  const client = await pool.connect(), uploaded = [];
  let committed = false, commitAttempted = false;
  try {
    await client.query('BEGIN');
    // An offline maintenance operation: prevent inserts colliding with preserved IDs.
    await client.query('LOCK TABLE deskpilot.records IN SHARE ROW EXCLUSIVE MODE');
    const occupied = await client.query('SELECT id FROM deskpilot.records WHERE workspace_id=$1 LIMIT 1',[workspace]);
    if (occupied.rows.length) throw new ApiError('The destination workspace is not empty. No data was overwritten.',409);
    for (const row of snapshot.records) await client.query('INSERT INTO deskpilot.records(workspace_id,kind,id,parent_id,document) VALUES($1,$2,$3,$4,$5::jsonb)',[workspace,row.kind,row.id,row.parent,JSON.stringify(row.document)]);
    await client.query("SELECT setval(pg_get_serial_sequence('deskpilot.records','id'), GREATEST(COALESCE((SELECT MAX(id) FROM deskpilot.records),0),1), true)");
    const repository = new PostgresRepository(client,workspace);
    for (const file of snapshot.files) {
      const stored = await attachments.upload(file.ticketId,new File([file.bytes],file.name));
      uploaded.push(stored);
      await attachments.verify(stored,file.hash);
      await repository.insert('attachment',{...stored,author:file.author,created:file.created || stored.created,commentId:file.commentId,hash:file.hash},file.ticketId);
    }
    if (await verifySource() !== snapshot.digest) throw new ApiError('SharePoint changed during the copy. Freeze writes and retry.',409);
    const actual = await client.query('SELECT kind,COUNT(*)::int AS count FROM deskpilot.records WHERE workspace_id=$1 GROUP BY kind',[workspace]);
    for (const [kind,count] of Object.entries(snapshot.counts)) if (Number(actual.rows.find(row=>row.kind===kind)?.count || 0)!==count) throw new ApiError('Migration row counts did not match.',409);
    await repository.insert('migration',{digest:snapshot.digest,counts:snapshot.counts,profileId,state:'staged',created:new Date().toISOString()});
    commitAttempted=true; await client.query('COMMIT'); committed=true;
    return {counts:snapshot.counts,digest:snapshot.digest};
  } finally {
    if (!committed) {
      await client.query('ROLLBACK').catch(()=>{});
      if (!commitAttempted) {
        const cleanup=await Promise.allSettled(uploaded.map(file=>attachments.remove(file)));
        if(cleanup.some(row=>row.status==='rejected')) console.error('Migration rollback left unreferenced blobs; an administrator must clean the destination workspace blob prefix.');
      } else console.error('Migration commit could not be confirmed. Blobs were retained. Verify staged data before retrying.');
    }
    client.release();
  }
}

