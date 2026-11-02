export interface IDepartmentFolder { key:string; name:string; }
export interface IDepartmentFolderPolicy { departments:IDepartmentFolder[]; ticketRoot:string; commentRoot:string; }
export function validateDepartmentFolderPolicy(value:IDepartmentFolderPolicy):void {
  if(!value || !Array.isArray(value.departments) || !value.departments.length || value.departments.some(item=>!/^[-a-z0-9]{1,64}$/.test(item.key) || !item.name?.trim()) || new Set(value.departments.map(item=>item.key)).size!==value.departments.length)throw new Error('Configure valid department folder keys and names.');
  for(const path of [value.ticketRoot,value.commentRoot])if(typeof path!=='string' || !path.startsWith('/') || path.includes('..') || path.includes('?') || path.includes('#') || path.includes('\\'))throw new Error('Configure server-relative ticket and comment list roots.');
  if(value.ticketRoot===value.commentRoot)throw new Error('Ticket and comment roots must be different lists.');
}
