@description('Azure region for resources')
param location string

@description('Environment name (dev or prod)')
@allowed(['dev', 'prod'])
param environment string

@description('PostgreSQL server name')
param serverName string

@description('Database administrator login')
param administratorLogin string

@secure()
@description('Database administrator password')
param administratorPassword string

@description('Database name')
param databaseName string = 'splitvibe'

@description('PostgreSQL SKU name')
param skuName string = 'Standard_B1ms'

@description('PostgreSQL SKU tier')
param skuTier string = 'Burstable'

@description('PostgreSQL storage size in GB')
param storageSizeGB int = 32

@description('Subnet ID for VNet integration')
param delegatedSubnetId string

@description('Private DNS Zone ID for PostgreSQL')
param privateDnsZoneId string

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: serverName
  location: location
  sku: {
    name: skuName
    tier: skuTier
  }
  properties: {
    version: '16'
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorPassword
    storage: {
      storageSizeGB: storageSizeGB
    }
    backup: {
      backupRetentionDays: environment == 'prod' ? 14 : 7
      geoRedundantBackup: environment == 'prod' ? 'Enabled' : 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      delegatedSubnetResourceId: delegatedSubnetId
      privateDnsZoneArmResourceId: privateDnsZoneId
    }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: server
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

@description('PostgreSQL server FQDN')
output fqdn string = server.properties.fullyQualifiedDomainName

@description('PostgreSQL server ID')
output id string = server.id

@description('PostgreSQL database name')
output databaseName string = database.name
