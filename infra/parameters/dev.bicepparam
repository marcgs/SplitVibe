using '../main.bicep'

param location = 'westeurope'
param environment = 'dev'
param baseName = 'splitvibe'
param postgresAdminLogin = 'splitvibeadmin'
// postgresAdminPassword — supply via CLI: --parameters postgresAdminPassword=<value>
// nextAuthSecret       — supply via CLI: --parameters nextAuthSecret=<value>
param containerImage = 'mcr.microsoft.com/k8se/quickstart:latest'
