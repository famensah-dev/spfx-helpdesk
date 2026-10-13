import { PublicClientApplication, InteractionRequiredAuthError, type AccountInfo } from '@azure/msal-browser';
import type { IAppConfig } from '../config';

export class MicrosoftAuth {
  public readonly client: PublicClientApplication;
  private readonly scopes: string[];
  public constructor(private readonly config: IAppConfig) {
    this.scopes = ['User.Read', config.graphSiteScope];
    this.client = new PublicClientApplication({
      auth: { clientId: config.clientId, authority: `https://login.microsoftonline.com/${config.tenantId}`,
        redirectUri: `${window.location.origin}/`, postLogoutRedirectUri: `${window.location.origin}/` },
      cache: { cacheLocation: 'sessionStorage' }
    });
  }
  public async initialize(): Promise<AccountInfo | undefined> {
    await this.client.initialize();
    const response = await this.client.handleRedirectPromise();
    const account = response?.account || this.client.getActiveAccount() || this.client.getAllAccounts().find(value => value.tenantId.toLowerCase() === this.config.tenantId.toLowerCase());
    if (account && account.tenantId.toLowerCase() !== this.config.tenantId.toLowerCase()) {
      throw new Error('Sign in with an account from your organization.');
    }
    if (account) this.client.setActiveAccount(account);
    return account;
  }
  public async signIn(): Promise<void> {
    await this.client.loginRedirect({ scopes: this.scopes });
  }
  public async switchAccount(): Promise<void> {
    await this.client.loginRedirect({ scopes: this.scopes, prompt: 'select_account' });
  }
  public async signOut(): Promise<void> {
    await this.client.logoutRedirect({ account: this.client.getActiveAccount() });
  }
  public async getToken(): Promise<string> {
    return this.getResourceToken(this.scopes);
  }
  public async getDirectoryToken(): Promise<string> {
    return this.getResourceToken(['https://graph.microsoft.com/User.Read.All']);
  }
  public async getSharePointToken(): Promise<string> {
    return this.getResourceToken([`${new URL(this.config.siteUrl).origin}/AllSites.Write`]);
  }
  private async getResourceToken(scopes: string[]): Promise<string> {
    const account = this.client.getActiveAccount();
    if (!account) throw new Error('Sign in to Microsoft 365 to access your tickets.');
    try {
      return (await this.client.acquireTokenSilent({ account, scopes })).accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        await this.client.acquireTokenRedirect({ account, scopes });
        throw new Error('Complete Microsoft 365 sign-in to continue.');
      }
      throw error;
    }
  }
}
