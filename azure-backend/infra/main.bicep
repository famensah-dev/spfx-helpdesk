param location string = resourceGroup().location
param functionName string
param tenantId string
param apiClientId string
param allowedClientIds string
param allowedOrigins array
param siteUrl string
param pageUrl string
param ticketsListName string = 'Tickets'
@allowed([512, 2048, 4096])
param instanceMemoryMB int = 2048
@minValue(40)
@maxValue(1000)
param maximumInstanceCount int = 40
@secure()
@description('Server-only SQL profiles JSON, preferably an Azure Key Vault app-setting reference. Leave [] for SharePoint-only workspaces.')
param sqlProfilesReference string = ''
@secure()
@description('Server-only PostgreSQL profiles JSON or a Key Vault app-setting reference. Leave [] for other providers.')
param postgresProfilesReference string = ''
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
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
  }
}
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}
resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'deskpilot-deployments'
  properties: {
    publicAccess: 'None'
  }
}
resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: '${functionName}-plan'
  location: location
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  properties: {
    reserved: true
  }
}
var settings = {
  AzureWebJobsStorage__credential: 'managedidentity'
  AzureWebJobsStorage__blobServiceUri: 'https://${storage.name}.blob.${environment().suffixes.storage}'
  AzureWebJobsStorage__queueServiceUri: 'https://${storage.name}.queue.${environment().suffixes.storage}'
  AzureWebJobsStorage__tableServiceUri: 'https://${storage.name}.table.${environment().suffixes.storage}'
  DESKPILOT_TENANT_ID: tenantId
  DESKPILOT_CLIENT_ID: apiClientId
  DESKPILOT_CLIENT_SECRET: apiCredentialReference
  DESKPILOT_ALLOWED_CLIENT_IDS: allowedClientIds
  DESKPILOT_ALLOWED_ORIGINS: join(allowedOrigins, ',')
  DESKPILOT_SITE_URL: siteUrl
  DESKPILOT_PAGE_URL: pageUrl
  DESKPILOT_TICKETS_LIST_NAME: ticketsListName
  DESKPILOT_SQL_PROFILES: empty(sqlProfilesReference) ? '[]' : sqlProfilesReference
  DESKPILOT_POSTGRES_PROFILES: empty(postgresProfilesReference) ? '[]' : postgresProfilesReference
  DESKPILOT_WORKER_ENABLED: 'false'
  DESKPILOT_AUTOMATION_SCHEDULE: '0 */1 * * * *'
  'AzureWebJobs.Automation.Disabled': 'true'
}
resource functions 'Microsoft.Web/sites@2024-04-01' = {
  name: functionName
  location: location
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    functionAppConfig: {
      runtime: {
        name: 'node'
        version: '24'
      }
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}${deploymentContainer.name}'
          authentication: {
            type: 'SystemAssignedIdentity'
          }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: maximumInstanceCount
        instanceMemoryMB: instanceMemoryMB
      }
    }
    siteConfig: {
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
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
// Host state, timer leases and deployment packages use the app identity, not account keys.
var hostStorageRoles = [
  'b7e6dc6d-f1e8-4753-8033-0f276bb0955b' // Storage Blob Data Owner
  '974c5e8b-45b9-4653-ba55-5f855dd0fb88' // Storage Queue Data Contributor
  '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3' // Storage Table Data Contributor
]
resource hostStorageAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for roleId in hostStorageRoles: {
  name: guid(storage.id, functions.id, roleId)
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleId)
    principalId: functions.identity.principalId
    principalType: 'ServicePrincipal'
  }
}]
output apiUrl string = 'https://${functions.properties.defaultHostName}'
output managedIdentityPrincipalId string = functions.identity.principalId
output deploymentStorageAccount string = storage.name
output deploymentStorageContainer string = deploymentContainer.name
