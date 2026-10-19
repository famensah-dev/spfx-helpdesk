import type { ITicketAttachment } from '../../interfaces/ITicketDataSource';
import { validateTicketAttachments } from '../../utils/ticketAttachments';
const quote = (name:string): string => encodeURIComponent(name.replace(/'/g,"''")).replace(/'/g,'%27');
/** Attachments stay on their ticket/comment list item and use its SharePoint permissions. */
export class SharePointAttachments {
  public constructor(private siteUrl:string,private token:()=>Promise<string>) {}
  private path(listId:string,id:number): string {
    if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(listId) || !Number.isSafeInteger(id) || id < 1) throw new Error('Invalid attachment target.');
    return `${this.siteUrl.replace(/\/$/,'')}/_api/web/lists(guid'${listId}')/items(${id})/AttachmentFiles`;
  }
  private async request(url:string,method = 'GET',body?:File): Promise<Response> {
    const token = await this.token();
    const response = await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,Accept:'application/json;odata=nometadata',...(body ? {'Content-Type':'application/octet-stream'} : {})},body,signal:AbortSignal.timeout(method === 'POST' ? 60000 : 30000)});
    if (!response.ok) throw new Error(`Attachment request failed (${response.status}). Check access, file limits, and that attachments are enabled on the list.`);
    return response;
  }
  public async list(listId:string,id:number): Promise<ITicketAttachment[]> {
    const base = this.path(listId,id);
    const response = await this.request(base);
    const data = await response.json() as {value:Array<{FileName:string}>};
    if (!Array.isArray(data.value)) throw new Error('SharePoint returned an invalid attachment list.');
    return data.value.map(file => ({name:file.FileName,url:`${base}('${quote(file.FileName)}')/$value`}));
  }
  public async ensureEnabled(listId:string): Promise<void> {
    const path = this.path(listId,1).split('/items(')[0];
    const response = await this.request(path + '?$select=EnableAttachments');
    const data = await response.json() as {EnableAttachments:boolean};
    if (!data.EnableAttachments) throw new Error('Attachments are disabled on this SharePoint list. Ask an administrator to enable them in List settings > Advanced settings.');
  }
  public async upload(listId:string,id:number,files:File[],progress?:(message:string)=>void): Promise<void> {
    validateTicketAttachments(files);
    if (!files.length) return;
    const base = this.path(listId,id);
    const existing = await this.list(listId,id);
    const existingNames = new Set(existing.map(file => file.name.toLowerCase()));
    if (existing.length + files.filter(file => !existingNames.has(file.name.toLowerCase())).length > 10) throw new Error('This record would exceed the 10-file attachment limit.');
    // Check every collision before sending any new file. A same-name file is not assumed to be a successful retry.
    const pending:File[] = [];
    for (const file of files) {
      const match = existing.find(value => value.name.toLowerCase() === file.name.toLowerCase());
      if (!match) {pending.push(file); continue;}
      progress?.(`Checking previously uploaded ${file.name}...`);
      const remote = await (await this.request(match.url)).arrayBuffer();
      const local = await file.arrayBuffer();
      if (remote.byteLength !== local.byteLength) throw new Error(`${file.name}: a different file with this name already exists. Rename your file before uploading.`);
      const [a,b] = await Promise.all([crypto.subtle.digest('SHA-256',remote),crypto.subtle.digest('SHA-256',local)]);
      if (!new Uint8Array(a).every((value,index) => value === new Uint8Array(b)[index])) throw new Error(`${file.name}: a different file with this name already exists. Rename your file before uploading.`);
    }
    for (let index = 0; index < pending.length; index++) {
      const file = pending[index]; progress?.(`Uploading ${file.name} (${index + 1} of ${pending.length})...`);
      try {await this.request(`${base}/add(FileName='${quote(file.name)}')`,'POST',file);}
      catch (reason) {throw new Error(`${file.name}: ${reason instanceof Error ? reason.message : 'Upload failed.'} Files already uploaded were retained. Retry to check and upload remaining files.`);}
    }
    progress?.('Attachments saved.');
  }
}
