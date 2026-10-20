export interface IAppConfig {
  tenantId: string;
  clientId: string;
  siteUrl: string;
  resourceIds?: Record<string, string>;
  siteId?: string;
  currentUserId?: number;
  currentUserEmail?: string;
  listName: string;
  listId?: string;
  faqListName?: string;
  faqListId?: string;
  userInformationListId?: string;
  graphSiteScope: 'Sites.Selected' | 'Sites.Read.All';
}
