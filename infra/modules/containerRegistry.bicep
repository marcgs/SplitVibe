@description('Azure region for resources')
param location string

@description('Environment name (dev or prod)')
@allowed(['dev', 'prod'])
param environment string

@description('Base name for the container registry')
param registryName string

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: registryName
  location: location
  sku: {
    name: environment == 'prod' ? 'Standard' : 'Basic'
  }
  properties: {
    adminUserEnabled: false
  }
}

@description('Container Registry resource ID')
output id string = acr.id

@description('Container Registry login server')
output loginServer string = acr.properties.loginServer

@description('Container Registry name')
output name string = acr.name
