#!/usr/bin/env python3
"""Update version numbers across all project files."""

import json
import re
import sys
from datetime import date
from pathlib import Path


def main():
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <version>")
        print(f"Example: {sys.argv[0]} 3.2.4")
        sys.exit(1)

    new_version = sys.argv[1]

    # Validate version format
    if not re.match(r"^\d+\.\d+\.\d+$", new_version):
        print(f"Error: Invalid version format '{new_version}'. Expected X.Y.Z")
        sys.exit(1)

    root = Path(__file__).parent.parent

    # Read current version from package.json
    package_json_path = root / "package.json"
    with open(package_json_path) as f:
        package_data = json.load(f)
    current_version = package_data["version"]

    print(f"Current version: {current_version}")
    print(f"New version: {new_version}")
    print()

    if current_version == new_version:
        print("Error: New version is the same as current version")
        sys.exit(1)

    # Update package.json
    package_data["version"] = new_version
    with open(package_json_path, "w") as f:
        json.dump(package_data, f, indent=2)
        f.write("\n")
    print("  package.json")

    # Update src/index.tsx
    index_tsx_path = root / "src" / "index.tsx"
    content = index_tsx_path.read_text()
    content, count = re.subn(
        rf"\.version\('{re.escape(current_version)}'\)",
        f".version('{new_version}')",
        content,
    )
    if count != 1:
        raise RuntimeError(
            f"Expected exactly 1 .version('{current_version}') match in {index_tsx_path}, found {count}"
        )
    index_tsx_path.write_text(content)
    print("  src/index.tsx")

    # Update src/patches/index.ts
    patches_path = root / "src" / "patches" / "index.ts"
    content = patches_path.read_text()
    content, count = re.subn(
        rf"writePatchesAppliedIndication\(\s*content,\s*'{re.escape(current_version)}'",
        f"writePatchesAppliedIndication(\n      content,\n      '{new_version}'",
        content,
    )
    if count != 1:
        raise RuntimeError(
            f"Expected exactly 1 writePatchesAppliedIndication(..., '{current_version}') match in {patches_path}, found {count}"
        )
    patches_path.write_text(content)
    print("  src/patches/index.ts")

    # Update CHANGELOG.md
    changelog_path = root / "CHANGELOG.md"
    content = changelog_path.read_text()
    today = date.today().strftime("%Y-%m-%d")
    release_url = f"https://github.com/Piebald-AI/tweakcc/releases/tag/v{new_version}"
    new_header = f"## [v{new_version}]({release_url}) - {today}\n"
    content, count = re.subn(
        r"(## Unreleased\n)",
        rf"\1\n{new_header}",
        content,
    )
    if count != 1:
        raise RuntimeError(
            f"Expected exactly 1 '## Unreleased' match in {changelog_path}, found {count}"
        )
    changelog_path.write_text(content)
    print("  CHANGELOG.md")

    print()
    print(f"Version updated to {new_version}")


if __name__ == "__main__":
    main()
