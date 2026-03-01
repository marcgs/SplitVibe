@description('Azure region for resources')
param location string

@description('Environment name (dev or prod)')
@allowed(['dev', 'prod'])
param environment string

@description('Container Apps Environment name')
param environmentName string

@description('Container App name')
param containerAppName string

@description('Container image to deploy')
param containerImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('ACR login server')
param acrLoginServer string

@description('Minimum number of replicas')
param minReplicas int = 0

@description('Maximum number of replicas')
param maxReplicas int = 2

@description('Log Analytics workspace resource ID')
param logAnalyticsWorkspaceId string

@description('Infrastructure subnet ID for Container Apps Environment')
param infrastructureSubnetId string

@description('DATABASE_URL Key Vault secret URI')
param databaseUrlSecretUri string

@description('NEXTAUTH_SECRET Key Vault secret URI')
param nextAuthSecretSecretUri string

@description('AZURE_STORAGE_ACCOUNT_NAME Key Vault secret URI')
param storageAccountNameSecretUri string

@description('AZURE_STORAGE_ACCOUNT_KEY Key Vault secret URI')
param storageAccountKeySecretUri string

@description('AZURE_STORAGE_CONNECTION_STRING Key Vault secret URI')
param storageConnectionStringSecretUri string

@description('Public app URL')
param appUrl string

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: last(split(logAnalyticsWorkspaceId, '/'))!
}

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: environmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsWorkspace.properties.customerId
        sharedKey: logAnalyticsWorkspace.listKeys().primarySharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: infrastructureSubnetId
      internal: false
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
        allowInsecure: false
      }
      registries: [
        {
          server: acrLoginServer
          identity: 'system'
        }
      ]
      secrets: [
        {
          name: 'database-url'
          keyVaultUrl: databaseUrlSecretUri
          identity: 'system'
        }
        {
          name: 'nextauth-secret'
          keyVaultUrl: nextAuthSecretSecretUri
          identity: 'system'
        }
        {
          name: 'azure-storage-account-name'
          keyVaultUrl: storageAccountNameSecretUri
          identity: 'system'
        }
        {
          name: 'azure-storage-account-key'
          keyVaultUrl: storageAccountKeySecretUri
          identity: 'system'
        }
        {
          name: 'azure-storage-connection-string'
          keyVaultUrl: storageConnectionStringSecretUri
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'splitvibe'
          image: containerImage
          resources: {
            cpu: json(environment == 'prod' ? '0.5' : '0.25')
            memory: environment == 'prod' ? '1Gi' : '0.5Gi'
          }
          env: [
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'NEXTAUTH_SECRET'
              secretRef: 'nextauth-secret'
            }
            {
              name: 'AUTH_URL'
              value: appUrl
            }
            {
              name: 'AZURE_STORAGE_ACCOUNT_NAME'
              secretRef: 'azure-storage-account-name'
            }
            {
              name: 'AZURE_STORAGE_ACCOUNT_KEY'
              secretRef: 'azure-storage-account-key'
            }
            {
              name: 'AZURE_STORAGE_CONNECTION_STRING'
              secretRef: 'azure-storage-connection-string'
            }
            {
              name: 'AZURE_STORAGE_CONTAINER_NAME'
              value: 'attachments'
            }
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PORT'
              value: '3000'
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

@description('Container App principal ID (managed identity)')
output principalId string = containerApp.identity.principalId

@description('Container App FQDN')
output fqdn string = containerApp.properties.configuration.ingress.fqdn

@description('Container App resource ID')
output id string = containerApp.id

@description('Container App name')
output name string = containerApp.name
