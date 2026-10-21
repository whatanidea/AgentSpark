param location string
param tags object
@minLength(5)
param resourceToken string
param tenantId string
param authAudience string
param webImageName string

@description('Global Standard capacity in thousands of tokens per minute.')
param openAiCapacity int = 50

var abbrs = {
  logs: 'log-'
  identity: 'id-'
  registry: 'cr'
  keyVault: 'kv-'
  cosmos: 'cosmos-'
  search: 'srch-'
  openAi: 'oai-'
  environment: 'cae-'
  app: 'ca-web-'
}
var databaseName = 'agentsense_db'
var searchIndexName = 'patterns-index'
var chatDeployment = 'gpt-5-mini'
var placeholderImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

// Built-in role definition IDs.
var acrPullRole = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var keyVaultSecretsUserRole = '4633458b-17de-408a-b874-0445c86b69e6'

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${abbrs.logs}${resourceToken}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    workspaceCapping: { dailyQuotaGb: 1 }
  }
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${abbrs.identity}web-${resourceToken}'
  location: location
  tags: tags
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${abbrs.registry}${resourceToken}'
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identity.id, acrPullRole)
  scope: registry
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRole)
  }
}

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: '${abbrs.cosmos}${resourceToken}'
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: true
    capacity: { totalThroughputLimit: 1000 }
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
    locations: [ { locationName: location, failoverPriority: 0, isZoneRedundant: false } ]
    minimalTlsVersion: 'Tls12'
    disableKeyBasedMetadataWriteAccess: true
    backupPolicy: {
      type: 'Periodic'
      periodicModeProperties: {
        backupIntervalInMinutes: 1440
        backupRetentionIntervalInHours: 48
        backupStorageRedundancy: 'Local'
      }
    }
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15' = {
  parent: cosmos
  name: databaseName
  properties: {
    resource: { id: databaseName }
    options: { throughput: 1000 }
  }
}

resource workflows 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: database
  name: 'workflows'
  properties: {
    resource: {
      id: 'workflows'
      partitionKey: { paths: [ '/session_id' ], kind: 'Hash', version: 2 }
      // -1 enables TTL but expires only documents that carry their own `ttl`.
      defaultTtl: -1
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [ { path: '/*' } ]
        excludedPaths: [ { path: '/"_etag"/?' } ]
      }
    }
  }
}

resource directory 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: database
  name: 'directory'
  properties: {
    resource: {
      id: 'directory'
      partitionKey: { paths: [ '/organization_id' ], kind: 'Hash', version: 2 }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [ { path: '/*' } ]
        excludedPaths: [ { path: '/"_etag"/?' } ]
      }
    }
  }
}

resource search 'Microsoft.Search/searchServices@2023-11-01' = {
  name: '${abbrs.search}${resourceToken}'
  location: location
  tags: tags
  sku: { name: 'free' }
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'default'
    publicNetworkAccess: 'enabled'
    authOptions: { apiKeyOnly: {} }
  }
}

resource openAi 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: '${abbrs.openAi}${resourceToken}'
  location: location
  tags: tags
  kind: 'OpenAI'
  sku: { name: 'S0' }
  properties: {
    customSubDomainName: '${abbrs.openAi}${resourceToken}'
    publicNetworkAccess: 'Enabled'
  }
}

resource chatModel 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openAi
  name: chatDeployment
  sku: { name: 'GlobalStandard', capacity: openAiCapacity }
  properties: {
    model: { format: 'OpenAI', name: 'gpt-5-mini', version: '2025-08-07' }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${abbrs.keyVault}${resourceToken}'
  location: location
  tags: tags
  properties: {
    tenantId: tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Enabled'
  }
}

resource cosmosKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'cosmos-db-key'
  properties: { value: cosmos.listKeys().primaryMasterKey }
}

resource searchKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'azure-search-key'
  properties: { value: search.listQueryKeys().value[0].key }
}

resource openAiKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'azure-openai-api-key'
  properties: { value: openAi.listKeys().key1 }
}

resource secretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, identity.id, keyVaultSecretsUserRole)
  scope: keyVault
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRole)
  }
}

resource containerAppsEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${abbrs.environment}${resourceToken}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
    workloadProfiles: [ { name: 'Consumption', workloadProfileType: 'Consumption' } ]
  }
}

resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${abbrs.app}${resourceToken}'
  location: location
  tags: union(tags, { 'azd-service-name': 'web' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  dependsOn: [ acrPull, secretsUser ]
  properties: {
    environmentId: containerAppsEnv.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8000
        transport: 'auto'
        allowInsecure: false
      }
      registries: [ { server: registry.properties.loginServer, identity: identity.id } ]
      secrets: [
        { name: 'cosmos-db-key', keyVaultUrl: cosmosKeySecret.properties.secretUri, identity: identity.id }
        { name: 'azure-search-key', keyVaultUrl: searchKeySecret.properties.secretUri, identity: identity.id }
        { name: 'azure-openai-api-key', keyVaultUrl: openAiKeySecret.properties.secretUri, identity: identity.id }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: empty(webImageName) ? placeholderImage : webImageName
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'ENVIRONMENT', value: 'production' }
            { name: 'AGENTSENSE_MODE', value: 'live' }
            { name: 'AGENTSENSE_AUTH_MODE', value: 'oidc' }
            { name: 'AUTH_ISSUER', value: '${environment().authentication.loginEndpoint}${tenantId}/v2.0' }
            { name: 'AUTH_AUDIENCE', value: authAudience }
            { name: 'AUTH_JWKS_URL', value: '${environment().authentication.loginEndpoint}${tenantId}/discovery/v2.0/keys' }
            { name: 'AUTH_REVIEWER_ROLE', value: 'AgentSense.Reviewer' }
            { name: 'SESSION_RETENTION_HOURS', value: '24' }
            { name: 'DECISION_ARCHIVE_RETENTION_DAYS', value: '30' }
            { name: 'COSMOS_DB_ENDPOINT', value: cosmos.properties.documentEndpoint }
            { name: 'COSMOS_DB_DATABASE_NAME', value: databaseName }
            { name: 'COSMOS_DB_KEY', secretRef: 'cosmos-db-key' }
            { name: 'AZURE_SEARCH_ENDPOINT', value: 'https://${search.name}.search.windows.net' }
            { name: 'AZURE_SEARCH_INDEX_NAME', value: searchIndexName }
            { name: 'AZURE_SEARCH_KEY', secretRef: 'azure-search-key' }
            { name: 'AZURE_OPENAI_ENDPOINT', value: openAi.properties.endpoint }
            { name: 'AZURE_OPENAI_CHAT_DEPLOYMENT', value: chatModel.name }
            { name: 'AZURE_OPENAI_API_VERSION', value: '2025-04-01-preview' }
            { name: 'AZURE_OPENAI_REASONING_EFFORT', value: 'low' }
            { name: 'AZURE_OPENAI_TIMEOUT_SECONDS', value: '120' }
            { name: 'AZURE_OPENAI_API_KEY', secretRef: 'azure-openai-api-key' }
          ]
          // `/ready` calls Azure OpenAI and is billable, so probes use `/health` only.
          probes: [
            {
              type: 'Startup'
              httpGet: { path: '/health', port: 8000 }
              initialDelaySeconds: 3
              periodSeconds: 5
              failureThreshold: 24
            }
            {
              type: 'Liveness'
              httpGet: { path: '/health', port: 8000 }
              periodSeconds: 30
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 2
        rules: [ { name: 'http', http: { metadata: { concurrentRequests: '20' } } } ]
      }
    }
  }
}

output registryLoginServer string = registry.properties.loginServer
output webAppName string = web.name
output webEndpoint string = 'https://${web.properties.configuration.ingress.fqdn}'
output searchEndpoint string = 'https://${search.name}.search.windows.net'
output searchName string = search.name
output searchIndexName string = searchIndexName
output openAiEndpoint string = openAi.properties.endpoint
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output keyVaultName string = keyVault.name
