@description('Principal ID to assign the role to')
param principalId string

@description('Role definition ID (GUID only, e.g., 7f951dda-4ed3-4680-a7ca-43fe172d538d)')
param roleDefinitionId string

@description('Target resource ID to scope the assignment to')
param targetResourceId string

resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(targetResourceId, principalId, roleDefinitionId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleDefinitionId)
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}
