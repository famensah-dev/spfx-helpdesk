import type { WebPartContext } from '@microsoft/sp-webpart-base';
export interface IHelpdeskSystemProps {
  description: string;
  isDarkTheme: boolean;
  environmentMessage: string;
  userDisplayName: string;
  spContext: WebPartContext;
}

