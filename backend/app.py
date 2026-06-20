import json
from pathlib import Path
from typing import Any, Dict

from engine import build_report

ROOT = Path(__file__).resolve().parent
MOCK_DIR = ROOT.parent / "mock-data"
ORG_FILE = MOCK_DIR / "organizations.json"


def load_org_data(slug: str) -> Dict[str, Any]:
    with ORG_FILE.open("r", encoding="utf-8") as f:
        orgs = json.load(f)
    org = next((item for item in orgs if item["slug"] == slug), None)
    if not org:
        raise ValueError(f"Organization slug not found: {slug}")
    with (MOCK_DIR / org["data_file"]).open("r", encoding="utf-8") as f:
        return json.load(f)


def run_report(slug: str) -> Dict[str, Any]:
    payload = load_org_data(slug)
    return build_report(payload)


if __name__ == "__main__":
    import sys

    slug = sys.argv[1] if len(sys.argv) > 1 else "kula-kitchen-group"
    report = run_report(slug)
    print(json.dumps(report, indent=2, ensure_ascii=False))
