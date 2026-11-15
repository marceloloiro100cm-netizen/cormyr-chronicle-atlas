#!/usr/bin/env python3
"""Safely unpack one private PostgreSQL custom dump from a ZIP.

No network/database access. The output is exclusive-create, owner-readable
only, and must be placed inside an existing private directory.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import stat
import sys
import zipfile
from pathlib import Path

MAX_ZIP_BYTES = 512 * 1024 * 1024
MAX_DUMP_BYTES = 1024 * 1024 * 1024
DUMP_NAME = re.compile(r"^[A-Za-z0-9_.-]{1,160}\.backup$")


def extract_private_backup(archive: str | Path, destination: str | Path) -> dict:
    source = Path(archive)
    output = Path(destination)
    source_stat = source.lstat()
    if not stat.S_ISREG(source_stat.st_mode) or source_stat.st_size > MAX_ZIP_BYTES:
        raise ValueError("Invalid private ZIP")
    parent = output.parent.resolve(strict=True)
    parent_stat = parent.stat()
    if not stat.S_ISDIR(parent_stat.st_mode) or parent_stat.st_mode & 0o077:
        raise ValueError("Output directory must be private (0700)")
    if output.name in ("", ".", "..") or "/" in output.name or "\\" in output.name:
        raise ValueError("Invalid destination filename")
    if not DUMP_NAME.fullmatch(output.name):
        raise ValueError("Output must end with .backup")
    with zipfile.ZipFile(source) as file:
        members = file.infolist()
        if len(members) != 1:
            raise ValueError("Expected exactly one PostgreSQL backup")
        item = members[0]
        if (item.is_dir() or not DUMP_NAME.fullmatch(item.filename) or
                item.flag_bits & 0x1 or item.file_size < 5 or
                item.file_size > MAX_DUMP_BYTES or
                item.compress_size > MAX_ZIP_BYTES or
                (item.compress_size and item.file_size > item.compress_size * 200)):
            raise ValueError("Invalid or unsafe ZIP member")
        member_mode = (item.external_attr >> 16) & 0o170000
        if member_mode not in (0, stat.S_IFREG):
            raise ValueError("ZIP member is not a regular file")
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        descriptor = os.open(output, flags, 0o600)
        done = False
        try:
            with os.fdopen(descriptor, "wb") as target:
                with file.open(item, "r") as original:
                    copied = 0
                    prefix = b""
                    while True:
                        chunk = original.read(1024 * 1024)
                        if not chunk:
                            break
                        if not prefix:
                            prefix = chunk[:5]
                            if prefix != b"PGDMP":
                                raise ValueError("Not a PostgreSQL custom dump")
                        copied += len(chunk)
                        if copied > MAX_DUMP_BYTES:
                            raise ValueError("Oversized PostgreSQL dump")
                        target.write(chunk)
                    if copied != item.file_size:
                        raise ValueError("Incomplete PostgreSQL dump")
                    target.flush()
                    os.fsync(target.fileno())
            done = True
        finally:
            if not done:
                try:
                    output.unlink()
                except FileNotFoundError:
                    pass
    return {
        "extracted": True,
        "pgDumpMagicValid": True,
        "archiveEntries": 1,
        "dumpBytes": item.file_size,
        "privateFileMode": "0600",
        "databaseWritten": False,
        "firebaseWritten": False,
    }


def main(args: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Extract one PRIVATE PostgreSQL dump from ZIP")
    parser.add_argument("--zip", dest="archive", required=True)
    parser.add_argument("--output", required=True)
    options = parser.parse_args(args)
    try:
        result = extract_private_backup(options.archive, options.output)
        print(json.dumps(result, separators=(",", ":")))
        return 0
    except Exception:
        # Never print paths, file listings, credentials, or underlying content.
        print("Private PostgreSQL ZIP extraction blocked; no data printed.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
