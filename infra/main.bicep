targetScope = 'subscription'

@minLength(1)
@maxLength(32)
@description('azd environment name, used to derive resource names.')
param environmentName string

@minLength(1)
@description('Primary region for all resources.')
param location string

@minLength(1)
@description('Entra application (client) ID that access tokens must target.')
param authAudience string

@description('Container image set by azd after the first deploy; empty uses a placeholder.')
param webImageName string = ''

var tags = { 'azd-env-name': environmentName, workload: 'agentspark' }

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

module resources 'resources.bicep' = {
  name: 'agentspark-resources'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceToken: toLower(uniqueString(subscription().id, environmentName, location))
    tenantId: tenant().tenantId
    authAudience: authAudience
    webImageName: webImageName
  }
}

output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.registryLoginServer
output AZURE_CONTAINER_APP_NAME string = resources.outputs.webAppName
output SERVICE_WEB_ENDPOINT string = resources.outputs.webEndpoint
output AZURE_SEARCH_ENDPOINT string = resources.outputs.searchEndpoint
output AZURE_SEARCH_SERVICE_NAME string = resources.outputs.searchName
output AZURE_SEARCH_INDEX_NAME string = resources.outputs.searchIndexName
output AZURE_OPENAI_ENDPOINT string = resources.outputs.openAiEndpoint
output COSMOS_DB_ENDPOINT string = resources.outputs.cosmosEndpoint
output AZURE_KEY_VAULT_NAME string = resources.outputs.keyVaultName
