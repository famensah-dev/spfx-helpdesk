export const workspaceLists = {categories: 'Ticket Categories', subcategories: 'Ticket Subcategories', issueTypes: 'Ticket Issue Types', priorities: 'Ticket Priorities', faqs: 'FAQs', access: 'DeskPilot Access'} as const;
export type WorkspaceListKey = keyof typeof workspaceLists | 'tickets';
export interface ISetupStep { resource: string; action: string; blocked?: boolean; }
export interface ISetupPlan { steps: ISetupStep[]; }
export interface IWorkspaceSetup { inspect(): Promise<ISetupPlan>; run(progress: (message: string) => void): Promise<void>; }
