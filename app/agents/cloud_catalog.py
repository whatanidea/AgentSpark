"""Assessment candidates only; not availability, pricing, or deployment validation."""
import hashlib
import json

from app.utils.models import CloudProvider

CLOUD_NAMES = {"azure": "Azure", "aws": "AWS"}
CATALOGS = {
    "azure": {
        "compute": ["Azure Container Apps", "Azure Functions"],
        "database": ["Azure Cosmos DB", "Azure SQL Database"],
        "ai": ["Azure OpenAI"],
        "search": ["Azure AI Search", "Not required"],
        "orchestration": ["LangGraph on Azure Container Apps", "Azure Durable Functions", "Deterministic application code"],
        "identity": ["Microsoft Entra ID", "Azure managed identities"],
        "secrets": ["Azure Key Vault"],
        "monitoring": ["Azure Monitor"],
    },
    "aws": {
        "compute": ["Amazon ECS on AWS Fargate", "AWS Lambda"],
        "database": ["Amazon DynamoDB", "Amazon Aurora"],
        "ai": ["Amazon Bedrock"],
        "search": ["Amazon Bedrock Knowledge Bases", "Not required"],
        "orchestration": ["LangGraph on Amazon ECS", "AWS Step Functions Standard Workflows",
                          "Deterministic application code"],
        "identity": ["AWS IAM roles", "Amazon Cognito"],
        "secrets": ["AWS Secrets Manager"],
        "monitoring": ["Amazon CloudWatch"],
    },
}
AWS_REFERENCES = [
    {"title": "Amazon Bedrock", "url": "https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html"},
    {"title": "ECS on Fargate", "url": "https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html"},
    {"title": "Step Functions callback integration",
     "url": "https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html"},
]
AWS_PATTERN_SERVICES = {
    "p02": ["Amazon Bedrock", "LangGraph on Amazon ECS"],
    "p04": ["AWS Step Functions Standard Workflows", "AWS IAM roles"],
    "p05": ["Amazon Bedrock", "Amazon Bedrock Knowledge Bases"],
    "p09": ["AWS Step Functions Standard Workflows", "AWS Lambda", "Amazon Bedrock"],
    "p20": ["Existing application hosting", "Existing system of record"],
}
LIMITATIONS = (
    "Assessment candidates, not a deployment plan or price quote. Region availability, model access, "
    "data residency, networking, integrations and costs have not been validated. "
    "AgentSpark remains Azure-hosted and processes this assessment using its configured Azure services. "
    "No customer cloud credentials are collected and no resources are provisioned."
)


def has_foreign_services(text: str, cloud: CloudProvider, existing_systems: str) -> bool:
    """Customer-declared external integrations may legitimately use another provider."""
    foreign = CATALOGS["azure" if cloud == "aws" else "aws"]
    names = {name for values in foreign.values() for name in values if name != "Not required"}
    if cloud == "aws":
        names.update(("Azure App Service", "Azure AI Foundry", "Azure Logic Apps", "Power Automate"))
    return any(name.lower() in text.lower() and name.lower() not in existing_systems.lower() for name in names)


def pattern_for_cloud(pattern: dict, cloud: CloudProvider) -> dict:
    if cloud == "azure":
        return pattern
    if pattern.get("target_cloud") == cloud:
        return pattern
    # Preserve the fetched design's provenance, but do not present its Azure services as AWS grounding.
    services = AWS_PATTERN_SERVICES.get(pattern["id"], [])
    content = {key: pattern[key] for key in ("id", "name", "category", "description", "when_to_use")}
    content.update(target_cloud=cloud, cloud_services=services,
                   implementation_references=AWS_REFERENCES if services and pattern["id"] != "p20" else [],
                   implementation_status="curated_candidates" if services else "not_mapped",
                   original_source_ref=pattern["source_ref"], original_content_sha256=pattern["content_sha256"])
    digest = hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()
    return {**content, "content_sha256": digest, "source_ref": f"aws-assessment-v1:{pattern['source_ref']}",
            "source_url": f"/api/v1/patterns/{pattern['id']}?target_cloud=aws",
            "score": pattern.get("score", 0), "retrieval_method": pattern["retrieval_method"]}
