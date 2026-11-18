/** SharePoint's basic rich-text mode strips tables when an item is written. */
export class SharePointRichText {
  private checked=new Map<string,Promise<void>>();
  public constructor(private readonly siteUrl:string,private readonly token?:()=>Promise<string>) {}
  public async preserveTables(listId:string,field:string,html:string):Promise<void> {
    if(!/<table\b/i.test(html))return;
    await this.prepareTables(listId,field);
  }
  public async prepareTables(listId:string,field:string):Promise<void> {
    const key=listId+':'+field;
    let request=this.checked.get(key);
    if(!request){request=this.ensure(listId,field);this.checked.set(key,request);}
    try{await request;}catch(error){this.checked.delete(key);throw error;}
  }
  private async ensure(listId:string,field:string):Promise<void> {
    const instruction=`Enable enhanced rich text for the ${field} column in SharePoint List settings before saving tables. Ask a site owner if you cannot change column settings.`;
    if(!this.token)throw new Error(instruction);
    const headers={Authorization:'Bearer '+await this.token(),Accept:'application/json;odata=nometadata'};
    const url=this.siteUrl.replace(/\/$/,'')+`/_api/web/lists(guid'${encodeURIComponent(listId)}')/fields/getbyinternalnameortitle('${encodeURIComponent(field.replace(/'/g,"''"))}')`;
    const response=await fetch(url+'?$select=TypeAsString,RichText,RestrictedMode,SchemaXml',{headers,signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('Unable to verify table storage. '+instruction);
    const json=await response.json();const info=json.d || json;
    if(info.TypeAsString!=='Note')throw new Error(instruction);
    // Plain multiline fields store HTML literally; comments and resolution summaries use this mode.
    if(info.RichText===false)return;
    const schema=new DOMParser().parseFromString(info.SchemaXml || '', 'application/xml');
    const root=schema.documentElement;
    if(root.tagName!=='Field' || schema.querySelector('parsererror'))throw new Error(instruction);
    if(root.getAttribute('RichTextMode')==='FullHtml' && info.RestrictedMode!==true && root.getAttribute('RestrictedMode')?.toUpperCase()!=='TRUE')return;
    root.setAttribute('RichText','TRUE');root.setAttribute('RichTextMode','FullHtml');root.setAttribute('RestrictedMode','FALSE');
    const update=await fetch(url,{method:'POST',headers:{...headers,'Content-Type':'application/json;odata=nometadata','X-HTTP-Method':'MERGE','IF-MATCH':'*'},body:JSON.stringify({SchemaXml:new XMLSerializer().serializeToString(root)}),signal:AbortSignal.timeout(30000)});
    if(!update.ok)throw new Error(instruction+' Your content has not been saved.');
  }
}
