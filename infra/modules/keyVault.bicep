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

@description('Google OAuth client ID')
param authGoogleId string

@secure()
@description('Google OAuth client secret')
param authGoogleSecret string

var databaseUrl = 'postgresql://${postgresAdminLogin}:${uriComponent(postgresAdminPassword)}@${postgresFqdn}:5432/${postgresDatabaseName}?sslmode=require'

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

resource secretAuthGoogleId 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'AUTH-GOOGLE-ID'
  properties: {
    value: authGoogleId
  }
}

resource secretAuthGoogleSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'AUTH-GOOGLE-SECRET'
  properties: {
    value: authGoogleSecret
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

@description('AUTH_GOOGLE_ID secret URI')
output authGoogleIdSecretUri string = secretAuthGoogleId.properties.secretUri

@description('AUTH_GOOGLE_SECRET secret URI')
output authGoogleSecretSecretUri string = secretAuthGoogleSecret.properties.secretUri
