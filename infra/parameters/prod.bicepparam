using '../main.bicep'

param location = 'westeurope'
param environment = 'prod'
param baseName = 'splitvibe'
param postgresAdminLogin = 'splitvibeadmin'
// postgresAdminPassword — supply via CLI or CI secret: --parameters postgresAdminPassword=<value>
// nextAuthSecret       — supply via CLI or CI secret: --parameters nextAuthSecret=<value>
// containerImage       — supply via CI: --parameters containerImage=<acr-login-server>/splitvibe:<tag>
