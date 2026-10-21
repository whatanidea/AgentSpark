class DependencyUnavailable(RuntimeError):
    def __init__(self, dependency: str, message: str | None = None):
        self.dependency = dependency
        super().__init__(message or f"{dependency} is unavailable; retry after checking the service configuration and health.")


class InvalidDependencyResponse(DependencyUnavailable):
    def __init__(self, dependency: str):
        super().__init__(dependency, f"{dependency} returned an invalid response.")


class ConcurrentUpdate(RuntimeError):
    def __init__(self):
        super().__init__("This session changed during the request. Fetch the latest state before retrying.")


class WorkflowNotFound(RuntimeError):
    def __init__(self):
        super().__init__("Session not found. Start with intake or diagnostic chat.")
