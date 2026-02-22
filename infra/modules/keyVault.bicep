@description('Azure region for resources')
param location string

@description('Key Vault name')
param keyVaultName string

@description('Tenant ID for Key Vault access policies')
param tenantId string

@description('PostgreSQL server FQDN')
param postgresFqdn string

@description('PostgreSQL administrator login')
param postgresAdminLogin string

@secure()
@description('PostgreSQL administrator password')
param postgresAdminPassword string

@description('PostgreSQL database name')
param postgresDatabaseName string

@description('Auth.js signing secret')
@secure()
param nextAuthSecret string

@description('Name of the existing storage account to reference')
param storageAccountName string

// Reference the existing storage account to retrieve keys without exposing them
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

var storageKey = storageAccount.listKeys().keys[0].value
var storageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storageAccountName};AccountKey=${storageKey};EndpointSuffix=core.windows.net'
var databaseUrl = 'postgresql://${postgresAdminLogin}:${postgresAdminPassword}@${postgresFqdn}:5432/${postgresDatabaseName}?sslmode=require'

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
  }
}

resource secretDatabaseUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'DATABASE-URL'
  properties: {
    value: databaseUrl
  }
}

resource secretNextAuthSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'NEXTAUTH-SECRET'
  properties: {
    value: nextAuthSecret
  }
}

resource secretStorageAccountName 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'AZURE-STORAGE-ACCOUNT-NAME'
  properties: {
    value: storageAccountName
  }
}

resource secretStorageAccountKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'AZURE-STORAGE-ACCOUNT-KEY'
  properties: {
    value: storageKey
  }
}

resource secretStorageConnectionString 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'AZURE-STORAGE-CONNECTION-STRING'
  properties: {
    value: storageConnectionString
  }
}

@description('Key Vault resource ID')
output id string = keyVault.id

@description('Key Vault name')
output name string = keyVault.name

@description('Key Vault URI')
output uri string = keyVault.properties.vaultUri

@description('DATABASE_URL secret URI')
output databaseUrlSecretUri string = secretDatabaseUrl.properties.secretUri

@description('NEXTAUTH_SECRET secret URI')
output nextAuthSecretSecretUri string = secretNextAuthSecret.properties.secretUri

@description('AZURE_STORAGE_ACCOUNT_NAME secret URI')
output storageAccountNameSecretUri string = secretStorageAccountName.properties.secretUri

@description('AZURE_STORAGE_ACCOUNT_KEY secret URI')
output storageAccountKeySecretUri string = secretStorageAccountKey.properties.secretUri

@description('AZURE_STORAGE_CONNECTION_STRING secret URI')
output storageConnectionStringSecretUri string = secretStorageConnectionString.properties.secretUri
