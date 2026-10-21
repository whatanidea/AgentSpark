#Requires -Version 7
<#
.SYNOPSIS
  Create the Azure AI Search index and seed the pattern library after `azd provision`.
.PARAMETER Python
  Python interpreter with the app dependencies installed (requirements.lock).
#>
param(
    [string]$Python = 'python'
)
$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')

$values = azd env get-values --output json | ConvertFrom-Json
$resourceGroup = $values.AZURE_RESOURCE_GROUP
$serviceName = $values.AZURE_SEARCH_SERVICE_NAME
if (-not $resourceGroup -or -not $serviceName) {
    throw 'Run azd provision first; AZURE_RESOURCE_GROUP or AZURE_SEARCH_SERVICE_NAME is missing.'
}

$env:AZURE_SEARCH_ENDPOINT = $values.AZURE_SEARCH_ENDPOINT
$env:AZURE_SEARCH_INDEX_NAME = $values.AZURE_SEARCH_INDEX_NAME
$env:AZURE_SEARCH_ADMIN_KEY = az search admin-key show --resource-group $resourceGroup --service-name $serviceName --query primaryKey -o tsv
try {
    & $Python (Join-Path $repoRoot 'scripts\seed_search_index.py')
    if ($LASTEXITCODE -ne 0) { throw "Search seeding failed with exit code $LASTEXITCODE." }
}
finally {
    Remove-Item Env:AZURE_SEARCH_ADMIN_KEY -ErrorAction SilentlyContinue
}
