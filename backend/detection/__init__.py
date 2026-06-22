"""
detection/__init__.py
Re-exports build_report so existing callers that do
    from detection import build_report
continue to work without modification.

If you import from a specific submodule (e.g. mixed_funds, cash_buffer),
import directly from that module rather than going through this __init__
— the submodules are the stable API, this file is purely a convenience
shim for backward compatibility.
"""

from .report_builder import build_report

__all__ = ["build_report"]