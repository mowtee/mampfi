"""Domain exceptions.

Services raise these; routers never import HTTPException.
A single exception handler in main.py translates them to HTTP responses.
"""


class NotFound(Exception):
    def __init__(self, resource: str = "resource") -> None:
        self.resource = resource
        super().__init__(f"{resource} not found")


class Forbidden(Exception):
    def __init__(self, detail: str = "forbidden") -> None:
        self.detail = detail
        super().__init__(detail)


class Conflict(Exception):
    """Business rule conflict. `detail` is serialized directly as the response detail field."""

    def __init__(self, detail: str | dict) -> None:
        self.detail = detail
        super().__init__(str(detail))


class DomainError(Exception):
    """Generic domain validation error — maps to HTTP 400."""

    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)
