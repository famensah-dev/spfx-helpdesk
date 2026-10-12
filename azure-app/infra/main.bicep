param resourceName string = 'deskpilot'
param location string = 'westeurope'
@allowed([
  'Free'
  'Standard'
])
param sku string = 'Standard'

resource app 'Microsoft.Web/staticSites@2024-04-01' = {
  name: resourceName
  location: location
  sku: {
    name: sku
    tier: sku
  }
  properties: {
    allowConfigFileUpdates: true
    buildProperties: {
      appLocation: 'azure-app'
      outputLocation: 'dist'
    }
  }
}
output applicationUrl string = 'https://${app.properties.defaultHostname}'
output resourceId string = app.id
