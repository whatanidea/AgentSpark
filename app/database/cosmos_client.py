import os
import uuid
import logging
from typing import Optional, Dict, Any
from azure.cosmos import CosmosClient, PartitionKey, exceptions
from app.utils.models import WorkflowState
from app.utils.env import get_valid_env

logger = logging.getLogger(__name__)

class DatabaseClient:
    def __init__(self):
        self.endpoint = get_valid_env("COSMOS_DB_ENDPOINT")
        self.key = get_valid_env("COSMOS_DB_KEY")
        self.database_name = os.environ.get("COSMOS_DB_DATABASE_NAME", "agentsense_db")
        self.use_mock = not (self.endpoint and self.key)
        
        if self.use_mock:
            logger.warning("Cosmos DB credentials missing. Using in-memory mock database.")
            self.mock_db: Dict[str, Dict[str, Any]] = {}
        else:
            try:
                self.client = CosmosClient(self.endpoint, self.key)
                self.database = self.client.create_database_if_not_exists(id=self.database_name)
                try:
                    self.container = self.database.create_container_if_not_exists(
                        id="workflows", 
                        partition_key=PartitionKey(path="/session_id")
                    )
                except Exception as e:
                    logger.warning(f"Failed to create container without throughput, retrying with throughput: {e}")
                    self.container = self.database.create_container_if_not_exists(
                        id="workflows", 
                        partition_key=PartitionKey(path="/session_id"),
                        offer_throughput=400
                    )
            except Exception as e:
                logger.error(f"Failed to connect to Cosmos DB: {e}. Falling back to mock DB.")
                self.use_mock = True
                self.mock_db = {}

    def get_workflow_state(self, session_id: str) -> WorkflowState:
        if self.use_mock:
            data = self.mock_db.get(session_id)
            if data:
                return WorkflowState(**data)
            return WorkflowState(session_id=session_id)
        else:
            try:
                response = self.container.read_item(item=session_id, partition_key=session_id)
                return WorkflowState(**response)
            except exceptions.CosmosResourceNotFoundError:
                return WorkflowState(session_id=session_id)
            except Exception as e:
                logger.error(f"Error reading from Cosmos DB: {e}")
                return WorkflowState(session_id=session_id)

    def save_workflow_state(self, state: WorkflowState) -> None:
        state_dict = state.model_dump()
        state_dict["id"] = state.session_id  # Cosmos requires an 'id' field
        
        if self.use_mock:
            self.mock_db[state.session_id] = state_dict
        else:
            try:
                self.container.upsert_item(state_dict)
            except Exception as e:
                logger.error(f"Error saving to Cosmos DB: {e}")

db_client = DatabaseClient()
