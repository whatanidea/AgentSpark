targetScope = 'resourceGroup'

@description('Approved region for the separate Foundry account.')
param location string

@description('Unique account name; does not modify the existing OpenAI account.')
param accountName string

@description('Consumption-based Claude deployment name.')
param deploymentName string = 'claude-haiku-5-5'

@minValue(1)
@maxValue(80)
@description('Rate-limit capacity, not provisioned throughput or a financial spending cap.')
param capacity int = 40

@secure()
@minLength(1)
@description('Actual deploying legal entity, supplied from the approved billing profile; never commit its value.')
param organizationName string

@minLength(2)
@maxLength(2)
@description('Registered organization country, not the inference region.')
param countryCode string

resource account 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: accountName
  location: location
  kind: 'AIServices'
  sku: { name: 'S0' }
  tags: { workload: 'agentspark', purpose: 'assessment-model-selection' }
  properties: {
    customSubDomainName: accountName
    allowProjectManagement: true
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: false
  }
}

// The provider attestation API is documented but not yet reflected in Bicep's published type catalog.
// https://learn.microsoft.com/azure/developer/ai/how-to/deploy-claude-foundry#terms-of-use
#disable-next-line BCP081
resource claude 'Microsoft.CognitiveServices/accounts/deployments@2026-05-01' = {
  parent: account
  name: deploymentName
  sku: { name: 'GlobalStandard', capacity: capacity }
  properties: {
    model: { format: 'Anthropic', name: 'claude-haiku-5-5', version: '2' }
    modelProviderData: { organizationName: organizationName, countryCode: countryCode, industry: 'technology' }
    versionUpgradeOption: 'NoAutoUpgrade'
  }
}

output accountEndpoint string = 'https://${accountName}.services.ai.azure.com'
output modelDeployment string = claude.name
output modelVersion string = '2'
