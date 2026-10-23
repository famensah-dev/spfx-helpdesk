const prefix='DESKPILOT_RICH_COMMENT_V1:';
export function encodeComment(text:string,html?:string):string {
  return html ? prefix+JSON.stringify({text,html}) : text;
}
export function decodeComment(value:string):{text:string;html?:string} {
  if(value.startsWith(prefix)){
    try{const parsed=JSON.parse(value.slice(prefix.length));if(typeof parsed.text==='string' && typeof parsed.html==='string')return {text:parsed.text,html:parsed.html};}catch{/* Preserve unrecognized legacy text. */}
  }
  return {text:value};
}
