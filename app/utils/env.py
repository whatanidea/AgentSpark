import os

def is_valid_config(value: str) -> bool:
    if not value:
        return False
    # If it's a placeholder from .env.example, treat as invalid
    if "your_" in value or "your-" in value:
        return False
    return True

def get_valid_env(key: str, default: str = None) -> str:
    val = os.environ.get(key, default)
    return val if is_valid_config(val) else None
