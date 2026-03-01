@description('Azure region for resources')
param location string

@description('Log Analytics workspace name')
param workspaceName string

@description('Environment name (dev or prod)')
@allowed(['dev', 'prod'])
param environment string

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: workspaceName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: environment == 'prod' ? 90 : 30
  }
}

@description('Log Analytics workspace ID')
output id string = workspace.id

@description('Log Analytics workspace customer ID')
output customerId string = workspace.properties.customerId
