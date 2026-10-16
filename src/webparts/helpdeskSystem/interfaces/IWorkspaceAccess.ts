export interface IWorkspaceAccess {role: string; oid: string; admin: boolean; superAdmin: boolean; agent: boolean; email: string; name: string; siteUrl: string;}
export interface IWorkspaceMember {id: string; name: string; email: string; role: 'admin' | 'agent' | 'superAdmin' | 'other'; roles?: string[]; protected?: boolean;}
export interface IWorkspaceMembers {list(): Promise<IWorkspaceMember[]>; save(member: IWorkspaceMember): Promise<void>; remove(member: IWorkspaceMember): Promise<void>;}
