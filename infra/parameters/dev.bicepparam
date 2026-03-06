using '../main.bicep'

param location = 'westeurope'
param environment = 'dev'
param baseName = 'splitvibe'
param postgresAdminLogin = 'splitvibeadmin'
param containerImage = 'mcr.microsoft.com/k8se/quickstart:latest'
param targetPort = 80
// postgresAdminPassword — supply via CLI: --parameters postgresAdminPassword=<value>
// nextAuthSecret       — supply via CLI: --parameters nextAuthSecret=<value>
// authGoogleId         — (optional) supply via CLI when Google OAuth is configured
// authGoogleSecret     — (optional) supply via CLI when Google OAuth is configured
