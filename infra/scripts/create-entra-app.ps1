#Requires -Version 7
<#
.SYNOPSIS
  Create or update the Entra ID API registration that AgentSpark validates bearer tokens against.
.DESCRIPTION
  Idempotent. Creates an app registration that issues v2 access tokens and exposes:
    - delegated scope   api://<appId>/access_as_user
    - app role          AgentSense.Reviewer (assignable to users)
  Azure CLI is pre-authorized so staging testers can run:
    az account get-access-token --scope api://<appId>/access_as_user
  The client ID is stored in the azd environment as AUTH_AUDIENCE.
#>
param(
    [string]$DisplayName = 'AgentSpark Staging API'
)
$ErrorActionPreference = 'Stop'
$azureCliAppId = '04b07795-8ddb-461a-bbee-02f9e1bf7b46'

$appId = az ad app list --display-name $DisplayName --query '[0].appId' -o tsv
if (-not $appId) {
    $appId = az ad app create --display-name $DisplayName --sign-in-audience AzureADMyOrg --query appId -o tsv
    Write-Host "Created app registration $DisplayName ($appId)."
}
$objectId = az ad app show --id $appId --query id -o tsv
$app = az rest --method GET --url "https://graph.microsoft.com/v1.0/applications/$objectId" | ConvertFrom-Json

$scope = $app.api.oauth2PermissionScopes | Where-Object value -eq 'access_as_user'
$scopeId = if ($scope) { $scope.id } else { [guid]::NewGuid().ToString() }
$role = $app.appRoles | Where-Object value -eq 'AgentSense.Reviewer'
$roleId = if ($role) { $role.id } else { [guid]::NewGuid().ToString() }

# Graph rejects removing an enabled scope while it is pre-authorized, so pre-authorize after the scope exists.
$body = @{
    identifierUris = @("api://$appId")
    api = @{
        requestedAccessTokenVersion = 2
        oauth2PermissionScopes = @(@{
            id = $scopeId; value = 'access_as_user'; type = 'User'; isEnabled = $true
            adminConsentDisplayName = 'Access AgentSpark'
            adminConsentDescription = 'Allows the signed-in user to call the AgentSpark API.'
            userConsentDisplayName = 'Access AgentSpark'
            userConsentDescription = 'Allows you to call the AgentSpark API.'
        })
    }
    appRoles = @(@{
        id = $roleId; value = 'AgentSense.Reviewer'; isEnabled = $true
        allowedMemberTypes = @('User')
        displayName = 'AgentSense Reviewer'
        description = 'Can approve or reject team workflows they did not create.'
    })
}
$tmp = New-TemporaryFile
try {
    $body | ConvertTo-Json -Depth 10 | Set-Content $tmp -Encoding utf8
    az rest --method PATCH --url "https://graph.microsoft.com/v1.0/applications/$objectId" `
        --headers 'Content-Type=application/json' --body "@$tmp" | Out-Null

    $preAuth = @{ api = @{ preAuthorizedApplications = @(@{ appId = $azureCliAppId; delegatedPermissionIds = @($scopeId) }) } }
    $preAuth | ConvertTo-Json -Depth 10 | Set-Content $tmp -Encoding utf8
    az rest --method PATCH --url "https://graph.microsoft.com/v1.0/applications/$objectId" `
        --headers 'Content-Type=application/json' --body "@$tmp" | Out-Null
}
finally {
    Remove-Item $tmp -ErrorAction SilentlyContinue
}

if (-not (az ad sp list --filter "appId eq '$appId'" --query '[0].id' -o tsv)) {
    az ad sp create --id $appId | Out-Null
}

azd env set AUTH_AUDIENCE $appId | Out-Null
Write-Host "AUTH_AUDIENCE=$appId stored in the azd environment."
Write-Host "Assign 'AgentSense Reviewer' to reviewer users under Enterprise applications > $DisplayName > Users and groups."
