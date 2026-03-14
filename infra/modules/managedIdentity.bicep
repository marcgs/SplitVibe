@description('Azure region for resources')
param location string

@description('Managed identity name')
param identityName string

resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
}

@description('Managed identity resource ID')
output id string = managedIdentity.id

@description('Managed identity principal ID')
output principalId string = managedIdentity.properties.principalId

@description('Managed identity client ID')
output clientId string = managedIdentity.properties.clientId
