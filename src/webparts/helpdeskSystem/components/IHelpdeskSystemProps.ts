import type { WebPartContext } from '@microsoft/sp-webpart-base';
export interface IHelpdeskSystemProps {
  workspaceSiteUrl?: string;
  workspacePageUrl?: string;
  listName: string;
  portalTitle?: string;
  listId?: string;
  description: string;
  isDarkTheme: boolean;
  environmentMessage: string;
  userDisplayName: string;
  spContext: WebPartContext;
}

