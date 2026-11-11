export interface IFaqInput { sourceTicketId?: number; agentEditingEnabled?: boolean; question: string; answer: string; category: string; subcategory?: string; categoryId?: string; subcategoryId?: string; keywords: string; published: boolean; sortOrder: number; }
export interface IFaq extends IFaqInput { id: number; modified: string; publisherEmail?: string; canEdit?: boolean; }
export type FaqBulkAction = { kind: 'publish'; published: boolean } | { kind: 'delete' } | { kind: 'sort' };
export interface IFaqBulkResult { succeeded: number[]; failed: Array<{ id: number; message: string }>; }
export interface IFaqAccess { canSubmitDraft?: boolean; canCreate?: boolean; canEditArticles?: boolean; supportsAgentEditing?: boolean; canManage: boolean; categories?: string[]; categoryOptions?: Array<{ id: string; name: string; active: boolean }>; subcategoryOptions?: Array<{ id: string; name: string; parentId: string; active: boolean }>; }
