// ---------------------------------------------------------------------------
// SplitVibe — Main Bicep orchestration template
// Usage:
//   az deployment sub create \
//     --location <region> \
//     --template-file infra/main.bicep \
//     --parameters infra/parameters/dev.bicepparam
// ---------------------------------------------------------------------------

targetScope = 'subscription'

// ── Parameters ──────────────────────────────────────────────────────────────

@description('Azure region for all resources')
param location string

@description('Environment name')
@allowed(['dev', 'prod'])
param environment string

@description('Base name used to derive resource names')
param baseName string = 'splitvibe'

@description('PostgreSQL administrator login')
param postgresAdminLogin string

@secure()
@description('PostgreSQL administrator password')
param postgresAdminPassword string

@secure()
@description('Auth.js signing secret')
param nextAuthSecret string

@description('Container image to deploy (defaults to quickstart placeholder)')
param containerImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

// ── Derived names ───────────────────────────────────────────────────────────

var suffix = uniqueString(subscription().subscriptionId, environment, baseName)
var resourceGroupName = 'rg-${baseName}-${environment}'
var acrName = replace('acr${baseName}${environment}${take(suffix, 6)}', '-', '')
var storageAccountName = take(replace('st${baseName}${environment}${suffix}', '-', ''), 24)
var keyVaultName = take('kv-${baseName}-${environment}-${suffix}', 24)
var postgresServerName = 'psql-${baseName}-${environment}'
var containerAppsEnvName = 'cae-${baseName}-${environment}'
var containerAppName = 'ca-${baseName}-${environment}'
var logAnalyticsName = 'log-${baseName}-${environment}'
var vnetName = 'vnet-${baseName}-${environment}'

// ── Resource Group ──────────────────────────────────────────────────────────

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
}

// ── Networking ──────────────────────────────────────────────────────────────

module networking 'modules/networking.bicep' = {
  name: 'networking'
  scope: rg
  params: {
    location: location
    vnetName: vnetName
    baseName: baseName
    environment: environment
  }
}

// ── Log Analytics ───────────────────────────────────────────────────────────

module logAnalytics 'modules/logAnalytics.bicep' = {
  name: 'logAnalytics'
  scope: rg
  params: {
    location: location
    workspaceName: logAnalyticsName
    environment: environment
  }
}

// ── Container Registry ──────────────────────────────────────────────────────

module acr 'modules/containerRegistry.bicep' = {
  name: 'containerRegistry'
  scope: rg
  params: {
    location: location
    environment: environment
    registryName: acrName
  }
}

// ── PostgreSQL ──────────────────────────────────────────────────────────────

module postgres 'modules/postgres.bicep' = {
  name: 'postgres'
  scope: rg
  params: {
    location: location
    environment: environment
    serverName: postgresServerName
    administratorLogin: postgresAdminLogin
    administratorPassword: postgresAdminPassword
    delegatedSubnetId: networking.outputs.postgresSubnetId
    privateDnsZoneId: networking.outputs.privateDnsZoneId
  }
}

// ── Blob Storage ────────────────────────────────────────────────────────────

module storage 'modules/storage.bicep' = {
  name: 'storage'
  scope: rg
  params: {
    location: location
    storageAccountName: storageAccountName
  }
}

// ── Key Vault ───────────────────────────────────────────────────────────────
// Deployed after PostgreSQL and Storage so it can reference their outputs/keys.

module keyVault 'modules/keyVault.bicep' = {
  name: 'keyVault'
  scope: rg
  params: {
    location: location
    keyVaultName: keyVaultName
    tenantId: subscription().tenantId
    postgresFqdn: postgres.outputs.fqdn
    postgresAdminLogin: postgresAdminLogin
    postgresAdminPassword: postgresAdminPassword
    postgresDatabaseName: postgres.outputs.databaseName
    nextAuthSecret: nextAuthSecret
    storageAccountName: storage.outputs.name
  }
}

// ── Container Apps ──────────────────────────────────────────────────────────
// Deployed after Key Vault so it can reference secret URIs.

module containerApps 'modules/containerApps.bicep' = {
  name: 'containerApps'
  scope: rg
  params: {
    location: location
    environment: environment
    environmentName: containerAppsEnvName
    containerAppName: containerAppName
    containerImage: containerImage
    acrLoginServer: acr.outputs.loginServer
    logAnalyticsWorkspaceId: logAnalytics.outputs.id
    infrastructureSubnetId: networking.outputs.containerAppsSubnetId
    databaseUrlSecretUri: keyVault.outputs.databaseUrlSecretUri
    nextAuthSecretSecretUri: keyVault.outputs.nextAuthSecretSecretUri
    storageAccountNameSecretUri: keyVault.outputs.storageAccountNameSecretUri
    storageAccountKeySecretUri: keyVault.outputs.storageAccountKeySecretUri
    storageConnectionStringSecretUri: keyVault.outputs.storageConnectionStringSecretUri
    appUrl: 'https://${containerAppName}.${location}.azurecontainerapps.io'
  }
}

// ── Role Assignments ────────────────────────────────────────────────────────
// Deployed after Container App so we can reference its system-assigned identity.

// AcrPull — allow the Container App to pull images from ACR
module acrPullRole 'modules/roleAssignment.bicep' = {
  name: 'acrPullRole'
  scope: rg
  params: {
    principalId: containerApps.outputs.principalId
    roleDefinitionId: '7f951dda-4ed3-4680-a7ca-43fe172d538d'
    targetResourceId: acr.outputs.id
  }
}

// Storage Blob Data Contributor — allow the Container App to read/write blobs
module storageBlobRole 'modules/roleAssignment.bicep' = {
  name: 'storageBlobRole'
  scope: rg
  params: {
    principalId: containerApps.outputs.principalId
    roleDefinitionId: 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
    targetResourceId: storage.outputs.id
  }
}

// Key Vault Secrets User — allow the Container App to read secrets
module keyVaultSecretsRole 'modules/roleAssignment.bicep' = {
  name: 'keyVaultSecretsRole'
  scope: rg
  params: {
    principalId: containerApps.outputs.principalId
    roleDefinitionId: '4633458b-17de-408a-b874-0445c86b69e6'
    targetResourceId: keyVault.outputs.id
  }
}

// ── Outputs ─────────────────────────────────────────────────────────────────

output resourceGroupName string = rg.name
output acrLoginServer string = acr.outputs.loginServer
output containerAppFqdn string = containerApps.outputs.fqdn
output containerAppUrl string = 'https://${containerApps.outputs.fqdn}'
output postgresFqdn string = postgres.outputs.fqdn
output keyVaultName string = keyVault.outputs.name
output storageAccountName string = storage.outputs.name
