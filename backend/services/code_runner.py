# Code execution has been permanently disabled for security reasons.
# The exec()-based Python sandbox was removed to eliminate RCE exposure.
# This stub preserves the import surface so no other module needs to change.

def execute_python_code(code: str, timeout: int = 25) -> dict:  # noqa: ARG001
    """Disabled — returns an error rather than executing arbitrary code."""
    return {
        "output": "",
        "error": "Code execution is strictly disabled for security reasons.",
        "images": [],
    }
