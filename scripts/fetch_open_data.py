#!/usr/bin/env python3
"""Download the City of Toronto's budget datasets from its Open Data portal (CKAN).

Usage:
    python3 scripts/fetch_open_data.py            # list matching datasets and their files
    python3 scripts/fetch_open_data.py --download # also save CSV/XLSX files to data/raw/<dataset>/

The downloaded files are the raw material for updating data/toronto-budget.json
(for example, adding a "2027" value to each program's "net" object). Mapping is
done by hand on purpose: the City's division names and groupings change between
years, and every figure on the site should be checked against the Budget Notes.

Only uses the Python standard library.
"""
import argparse
import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request

CKAN = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action"
QUERIES = ["operating budget", "capital budget", "budget"]
ROOT = pathlib.Path(__file__).resolve().parent.parent


def ckan(action, **params):
    url = f"{CKAN}/{action}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=60) as resp:
        payload = json.load(resp)
    if not payload.get("success"):
        raise RuntimeError(f"CKAN call failed: {url}")
    return payload["result"]


def find_packages():
    seen = {}
    for q in QUERIES:
        for pkg in ckan("package_search", q=q, rows=50)["results"]:
            if "budget" in pkg["title"].lower():
                seen[pkg["name"]] = pkg
    return sorted(seen.values(), key=lambda p: p["title"])


def safe_name(s):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", s).strip("_")[:120]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--download", action="store_true", help="save CSV/XLSX resources to data/raw/")
    args = ap.parse_args()

    try:
        packages = find_packages()
    except OSError as e:
        sys.exit(f"Could not reach Toronto Open Data ({e}). Check your network connection.")

    for pkg in packages:
        print(f"\n{pkg['title']}  [{pkg['name']}]  refreshed {pkg.get('last_refreshed', '?')}")
        for res in pkg.get("resources", []):
            fmt = (res.get("format") or "").upper()
            print(f"   - {res.get('name')} ({fmt})")
            if args.download and fmt in {"CSV", "XLSX", "XLS"} and res.get("url"):
                out_dir = ROOT / "data" / "raw" / safe_name(pkg["name"])
                out_dir.mkdir(parents=True, exist_ok=True)
                target = out_dir / safe_name(f"{res.get('name')}.{fmt.lower()}")
                urllib.request.urlretrieve(res["url"], target)
                print(f"     saved {target.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
