// ---------------------------------------------------------------------------
// SplitVibe — Main Bicep orchestration template
// Usage:
//   az deployment sub create \
//     --location <region> \
//     --template-file infra/main.bicep \
//     --parameters infra/parameters/dev.parameters.json
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

@description('Public application URL for Auth.js (used when customDomain is not provided)')
param appUrl string = ''

@description('Custom domain hostname for the app (for example app.example.com). When set, AUTH_URL is derived as https://<customDomain>.')
param customDomain string = ''

@description('Container port (default 3000 for SplitVibe; use 80 for placeholder quickstart image)')
param targetPort int = 3000

@description('Google OAuth client ID (optional — supply when ready to enable Google sign-in)')
param authGoogleId string = ''

@secure()
@description('Google OAuth client secret (optional — supply when ready to enable Google sign-in)')
param authGoogleSecret string = ''

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
var managedIdentityName = 'id-${baseName}-${environment}'
var effectiveAppUrl = !empty(customDomain) ? 'https://${customDomain}' : appUrl

// ── Resource Group ──────────────────────────────────────────────────────────

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
}

// ── Managed Identity ────────────────────────────────────────────────────────
// Deployed first so role assignments can reference its principalId before
// the Container App is created (avoids RBAC chicken-and-egg on first deploy).

module managedIdentity 'modules/managedIdentity.bicep' = {
  name: 'managedIdentity'
  scope: rg
  params: {
    location: location
    identityName: managedIdentityName
  }
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
    corsOrigin: effectiveAppUrl
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
    authGoogleId: authGoogleId
    authGoogleSecret: authGoogleSecret
  }
}

// ── Role Assignments ────────────────────────────────────────────────────────
// Deployed BEFORE the Container App so RBAC is in place when the app starts.
// Uses the user-assigned managed identity so principalId is known ahead of time.

// AcrPull — allow the Container App to pull images from ACR
module acrPullRole 'modules/roleAssignment.bicep' = {
  name: 'acrPullRole'
  scope: rg
  params: {
    principalId: managedIdentity.outputs.principalId
    roleDefinitionId: '7f951dda-4ed3-4680-a7ca-43fe172d538d'
    targetResourceId: acr.outputs.id
  }
}

// Storage Blob Data Contributor — allow the Container App to read/write blobs
module storageBlobRole 'modules/roleAssignment.bicep' = {
  name: 'storageBlobRole'
  scope: rg
  params: {
    principalId: managedIdentity.outputs.principalId
    roleDefinitionId: 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
    targetResourceId: storage.outputs.id
  }
}

// Key Vault Secrets User — allow the Container App to read secrets
module keyVaultSecretsRole 'modules/roleAssignment.bicep' = {
  name: 'keyVaultSecretsRole'
  scope: rg
  params: {
    principalId: managedIdentity.outputs.principalId
    roleDefinitionId: '4633458b-17de-408a-b874-0445c86b69e6'
    targetResourceId: keyVault.outputs.id
  }
}

// ── Container Apps ──────────────────────────────────────────────────────────
// Deployed after Key Vault (secret URIs) and after role assignments (RBAC ready).

module containerApps 'modules/containerApps.bicep' = {
  name: 'containerApps'
  scope: rg
  dependsOn: [acrPullRole, storageBlobRole, keyVaultSecretsRole]
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
    authGoogleIdSecretUri: keyVault.outputs.authGoogleIdSecretUri
    authGoogleSecretSecretUri: keyVault.outputs.authGoogleSecretSecretUri
    appUrl: effectiveAppUrl
    managedIdentityId: managedIdentity.outputs.id
    managedIdentityClientId: managedIdentity.outputs.clientId
    targetPort: targetPort
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
