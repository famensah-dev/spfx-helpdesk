param location string = resourceGroup().location
param functionName string
param tenantId string
param apiClientId string
param allowedClientIds string
param allowedOrigins array
param siteUrl string
param pageUrl string
param ticketsListName string = 'Tickets'
@secure()
@description('Key Vault app-setting reference: @Microsoft.KeyVault(SecretUri=https://...)')
param apiCredentialReference string
var storageName = 'dp${uniqueString(resourceGroup().id, functionName)}'
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
  }
}
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${functionName}-plan'
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
}
var settings = {
  FUNCTIONS_EXTENSION_VERSION: '~4'
  FUNCTIONS_WORKER_RUNTIME: 'node'
  WEBSITE_NODE_DEFAULT_VERSION: '~22'
  WEBSITE_RUN_FROM_PACKAGE: '1'
  AzureWebJobsStorage: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
  DESKPILOT_TENANT_ID: tenantId
  DESKPILOT_CLIENT_ID: apiClientId
  DESKPILOT_CLIENT_SECRET: apiCredentialReference
  DESKPILOT_ALLOWED_CLIENT_IDS: allowedClientIds
  DESKPILOT_ALLOWED_ORIGINS: join(allowedOrigins, ',')
  DESKPILOT_SITE_URL: siteUrl
  DESKPILOT_PAGE_URL: pageUrl
  DESKPILOT_TICKETS_LIST_NAME: ticketsListName
  DESKPILOT_WORKER_ENABLED: 'false'
  DESKPILOT_AUTOMATION_SCHEDULE: '0 */1 * * * *'
  'AzureWebJobs.Automation.Disabled': 'true'
}
resource functions 'Microsoft.Web/sites@2023-12-01' = {
  name: functionName
  location: location
  kind: 'functionapp'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      ftpsState: 'Disabled'
      cors: {
        allowedOrigins: allowedOrigins
        supportCredentials: false
      }
      appSettings: [for setting in items(settings): {
        name: setting.key
        value: setting.value
      }]
    }
  }
}
output apiUrl string = 'https://${functions.properties.defaultHostName}'
output managedIdentityPrincipalId string = functions.identity.principalId
