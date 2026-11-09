import { createHash } from 'node:crypto';
import { ApiError } from '../tokens.mjs';


const hash = value => createHash('sha256').update(value).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
  return value;
}
const fingerprint = value => hash(JSON.stringify(canonical(value)));
function recordId(value) { const id = Number(value); if (!Number.isSafeInteger(id) || id < 1) throw new ApiError('Migration found an invalid source ID.', 400); return id; }

/** Read-only snapshot. Attachment URLs are excluded from the digest; file bytes are hashed. */
export async function captureSharePoint(source, readAttachment) {
  if (!source.access?.superAdmin) throw new ApiError('Super Admin access is required.');
  const result = await source.getTickets();
  if (result.assignmentIdentityAvailable === false) throw new ApiError('Resolve source ticket identities before migrating.', 409);
  const records = [], files = [];
  const add = (kind, id, value, parent = 0) => { const {id:sourceId,version,...document}=value; records.push({kind, id:recordId(id), parent, document}); };
  let historyId = 0, totalBytes = 0;
  for (const original of [...result.tickets].sort((a,b)=>a.Id-b.Id)) {
    const {ChangeVersion, WebUrl, ...ticket} = original;
    add('ticket', ticket.Id, ticket);
    const comments = await source.getComments(ticket.Id);
    const attachments = await source.getAttachments(ticket.Id);
    const captureFile = async (file, commentId) => {
      const bytes = Buffer.from(await readAttachment(file));
      totalBytes += bytes.length;
      if(totalBytes > 256*1024*1024) throw new ApiError('Migration exceeds the 256 MB attachment snapshot limit. Use a reviewed batched migration.',400);
      if (!file.name || /[\\/\r\n]/.test(file.name) || bytes.length > 5*1024*1024 || file.size !== undefined && file.size !== bytes.length) throw new ApiError('A source attachment is invalid, larger than 5 MB, or changed during migration.', 409);
      files.push({ticketId:ticket.Id, commentId, name:file.name, author:file.author, created:file.created, size:bytes.length, hash:hash(bytes), bytes});
    };
    for (const file of attachments) await captureFile(file);
    for (const comment of [...comments].sort((a,b)=>Number(a.id)-Number(b.id))) {
      if (comment.attachmentError) throw new ApiError('A comment attachment could not be read. Migration stopped.', 409);
      const id = recordId(comment.id);
      add('comment', id, {ticketId:ticket.Id,text:comment.text,html:comment.html,author:comment.author,created:comment.created,owner:'',source:'sharepoint'}, ticket.Id);
      for (const file of comment.attachments || []) await captureFile(file, String(id));
    }
    for (const version of await source.getHistory(ticket.Id)) add('history', ++historyId, {...version,sourceVersionId:version.id}, ticket.Id);
  }
  for (const article of await source.getFaqs(true)) add('article', article.id, article);
  // Preserve the selected solution link; never silently drop an unresolved reference.
  for (const row of records.filter(row=>row.kind==='ticket' && row.document.SolutionCommentId)) {
    if (!records.some(comment=>comment.kind==='comment' && comment.parent===row.id && String(comment.id)===String(row.document.SolutionCommentId))) throw new ApiError('A source solution references a missing comment.', 409);
  }
  const counts = Object.fromEntries(['ticket','comment','history','article'].map(kind=>[kind,records.filter(row=>row.kind===kind).length]));
  counts.attachment = files.length;
  const configuration = await source.roleManagement.load();
  const digest = fingerprint({records:[...records].sort((a,b)=>a.kind.localeCompare(b.kind)||a.id-b.id),files:files.map(({bytes,...file})=>file).sort((a,b)=>a.ticketId-b.ticketId || String(a.commentId || '').localeCompare(String(b.commentId || '')) || a.name.localeCompare(b.name)),configuration});
  return {records, files, counts, digest, configuration};
}

export async function verifyStaged({repository, snapshot, attachments, profileId}) {
  const manifests = await repository.list('migration');
  if (manifests.length!==1 || manifests[0].digest!==snapshot.digest || manifests[0].profileId!==profileId) throw new ApiError('The staged migration does not match the current source and connection.',409);
  for (const kind of ['ticket','comment','history','article']) {
    const actual = await repository.list(kind), expected = snapshot.records.filter(row=>row.kind===kind);
    if (actual.length!==expected.length) throw new ApiError('Staged data verification failed.',409);
    for (const row of actual) {
      const {id,version,...document}=row, original=expected.find(item=>item.id===id);
      if (!original || fingerprint(document)!==fingerprint(original.document)) throw new ApiError('Staged data changed after migration.',409);
    }
  }
  const files=await repository.list('attachment');
  if(files.length!==snapshot.files.length)throw new ApiError('Staged attachment counts do not match.',409);
  const remaining=[...files];
  for(const expected of snapshot.files){
    const index=remaining.findIndex(file=>file.name===expected.name&&file.commentId===expected.commentId&&file.key.startsWith(repository.workspace+'/'+expected.ticketId+'/')&&file.hash===expected.hash);
    if(index<0)throw new ApiError('Staged attachment verification failed.',409);
    await attachments.verify(remaining.splice(index,1)[0],expected.hash);
  }
  return manifests[0];
}
