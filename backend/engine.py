"""
backend/engine.py
CLI entrypoint — reads a payload from a file argument or stdin,
runs build_report, and writes the result to stdout as JSON.

This file is now a thin wrapper. All detection logic lives in the
detection/ package. If you import build_report from here (as
run_report.py does via `from engine import build_report`), that still
works — the import is re-exported below for backward compatibility.
The preferred import going forward is:
    from detection import build_report
or
    from detection.report_builder import build_report

Invocation (unchanged):
    python engine.py <path-to-payload.json>
    python engine.py < payload.json   (stdin)
"""

import json
import sys

from detection.report_builder import build_report  # noqa: F401 — re-export for run_report.py


def main() -> None:
    if len(sys.argv) > 1:
        with open(sys.argv[1], "r", encoding="utf-8") as fd:
            payload = json.load(fd)
    else:
        payload = json.load(sys.stdin)

    report = build_report(payload)
    json.dump(report, sys.stdout, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()