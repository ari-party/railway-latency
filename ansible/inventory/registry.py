#!/usr/bin/env python3
"""Dynamic inventory that fetches the control plane's GET /internal/inventory (CONTROL_PLANE_INVENTORY_URL) and passes it through to ansible-playbook via --list and --host."""

import json
import os
import sys
import urllib.request


def fetch_inventory():
    url = os.environ.get("CONTROL_PLANE_INVENTORY_URL")
    if not url:
        sys.stderr.write("CONTROL_PLANE_INVENTORY_URL is not set\n")
        sys.exit(1)
    headers = {"accept": "application/json"}
    token = os.environ.get("CONTROL_PLANE_INTERNAL_TOKEN")
    if token:
        headers["X-Internal-Token"] = token
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def main():
    arguments = sys.argv[1:]

    if "--list" in arguments:
        json.dump(fetch_inventory(), sys.stdout)
        return

    if "--host" in arguments:
        host_index = arguments.index("--host") + 1
        host_name = arguments[host_index] if host_index < len(arguments) else ""
        inventory = fetch_inventory()
        host_variables = inventory.get("_meta", {}).get("hostvars", {}).get(host_name, {})
        json.dump(host_variables, sys.stdout)
        return

    sys.stderr.write("usage: registry.py --list | --host <hostname>\n")
    sys.exit(2)


if __name__ == "__main__":
    main()
