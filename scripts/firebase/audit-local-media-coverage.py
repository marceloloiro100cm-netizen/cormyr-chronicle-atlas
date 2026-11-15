#!/usr/bin/env python3
"""Offline SHA-256 coverage audit for private Cormyr campaign media archives.

No extraction, database, network, Firebase, uploads or source writes.
Only aggregate counters are printed; no file names, object paths or hashes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import sys
import zipfile
from collections import Counter
from pathlib import Path

MAX_MANIFEST_BYTES = 16 * 1024 * 1024
MAX_ZIP_BYTES = 1024 * 1024 * 1024
MAX_ENTRY_BYTES = 512 * 1024 * 1024
MAX_EXPANDED_BYTES = 8 * 1024 * 1024 * 1024
MAX_ENTRIES = 50_000
SHA = re.compile(r"[a-f0-9]{64}\Z")
BUCKETS = ("campaign-images", "campaign-newspapers", "campaign-newspaper-staff",
           "campaign-newspaper-commissions", "campaign-newspaper-engravings")


class PrivateAuditError(ValueError):
    pass


def _private_file(path: Path, limit: int) -> None:
    metadata = path.lstat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_size <= 0 or metadata.st_size > limit:
        raise PrivateAuditError("Invalid regular private source file")


def _safe_name(name: str) -> bool:
    return (isinstance(name, str) and len(name) <= 2048 and name and
            not name.startswith(("/", "\\")) and "\\" not in name and
            not any(part in ("", ".", "..") for part in name.rstrip("/").split("/")) and
            not any(ord(char) < 32 for char in name))


def _manifest(path: Path):
    _private_file(path, MAX_MANIFEST_BYTES)
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if (not isinstance(manifest, dict) or manifest.get("bucket") != "campaign-images" or
            type(manifest.get("complete")) is not bool or
            not isinstance(manifest.get("files"), list)):
        raise PrivateAuditError("Invalid image export manifest")
    result = []
    seen_paths = set()
    hash_sizes = {}
    for row in manifest["files"]:
        if not isinstance(row, dict):
            raise PrivateAuditError("Invalid image manifest row")
        object_path, digest, size = row.get("path"), row.get("sha256"), row.get("size")
        if (not _safe_name(object_path) or object_path in seen_paths or
                not isinstance(digest, str) or not SHA.fullmatch(digest.lower()) or
                type(size) is not int or size < 0 or size > MAX_ENTRY_BYTES):
            raise PrivateAuditError("Invalid or duplicate private manifest reference")
        if digest.lower() in hash_sizes and hash_sizes[digest.lower()] != size:
            raise PrivateAuditError("Contradictory digest sizes in manifest")
        hash_sizes[digest.lower()] = size
        seen_paths.add(object_path)
        result.append((digest.lower(), size))
    if len(result) > MAX_ENTRIES:
        raise PrivateAuditError("Manifest too large")
    return manifest["complete"], result


def _archive(path: Path):
    _private_file(path, MAX_ZIP_BYTES)
    entries, bytes_total, directory_entries = [], 0, 0
    with zipfile.ZipFile(path, "r") as source:
        members = source.infolist()
        if len(members) > MAX_ENTRIES:
            raise PrivateAuditError("ZIP exceeds entry limit")
        for info in members:
            if (not _safe_name(info.filename) or info.flag_bits & 1 or
                    info.file_size > MAX_ENTRY_BYTES or
                    (info.compress_size == 0 and info.file_size > 0) or
                    (info.compress_size > 0 and info.file_size > info.compress_size * 400)):
                raise PrivateAuditError("Unsafe private ZIP member")
            member_type = (info.external_attr >> 16) & 0o170000
            if member_type not in (0, stat.S_IFREG, stat.S_IFDIR):
                raise PrivateAuditError("Non-regular ZIP member")
            if info.is_dir():
                directory_entries += 1
                continue
            bytes_total += info.file_size
            if bytes_total > MAX_EXPANDED_BYTES:
                raise PrivateAuditError("ZIP expansion too large")
            digest = hashlib.sha256()
            with source.open(info, "r") as stream:
                while True:
                    chunk = stream.read(1024 * 1024)
                    if not chunk:
                        break
                    digest.update(chunk)
            entries.append((digest.hexdigest(), info.file_size))
    return entries, bytes_total, directory_entries


def inspect_media_archives(manifest_path: Path, paths_by_bucket: dict):
    complete, expected = _manifest(Path(manifest_path))
    if not paths_by_bucket.get("campaign-images"):
        raise PrivateAuditError("At least one image ZIP is required")
    if any(bucket not in BUCKETS for bucket in paths_by_bucket):
        raise PrivateAuditError("Unknown media bucket")
    reports = {}
    images_seen = set()
    for bucket in BUCKETS:
        archives = paths_by_bucket.get(bucket, [])
        actual = []
        raw_bytes = 0
        directories = 0
        for path in archives:
            entries, count, dirs = _archive(Path(path))
            actual.extend(entries)
            raw_bytes += count
            directories += dirs
        distinct = set(actual)
        reports[bucket] = {
            "archiveCount": len(archives),
            "fileEntries": len(actual),
            "uniqueContentHashes": len({digest for digest, _ in distinct}),
            "duplicateContentEntries": len(actual) - len(distinct),
            "uncompressedBytes": raw_bytes,
            "directoryEntriesIgnored": directories,
            "zipIntegrityVerified": True if archives else False,
            "manifestCoverageVerified": bucket == "campaign-images",
        }
        if bucket == "campaign-images":
            images_seen = distinct
    expected_unique = set(expected)
    matched_refs = sum(1 for entry in expected if entry in images_seen)
    unmatched = len(expected) - matched_refs
    result = {
        "scope": "PRIVATE_LOCAL_ZIP_SHA256_AUDIT",
        "manifestComplete": complete,
        "manifestReferences": len(expected),
        "manifestUniqueContent": len(expected_unique),
        "manifestReferencesMatched": matched_refs,
        "manifestReferencesMissingFromZips": unmatched,
        "manifestUniqueContentMissingFromZips": len(expected_unique - images_seen),
        "zipContentNotInManifest": len(images_seen - expected_unique),
        "imageArchiveCoverageComplete": (complete and bool(expected) and
            unmatched == 0 and len(images_seen - expected_unique) == 0),
        "buckets": reports,
        "pathMappingVerified": False,
        "sourceLiveReconciled": False,
        "destinationCloudVerified": False,
        "sourceFrozen": False,
        "databaseWrites": 0,
        "cloudWrites": 0,
        "readyForCutover": False,
    }
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True)
    for key in BUCKETS:
        parser.add_argument("--" + key + "-zip", action="append", default=[])
    args = parser.parse_args(argv)
    inputs = {bucket: getattr(args, bucket.replace("-", "_") + "_zip") for bucket in BUCKETS}
    try:
        summary = inspect_media_archives(Path(args.manifest), inputs)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0 if summary["imageArchiveCoverageComplete"] else 1
    except Exception:
        # Malformed source files may contain names, credentials or raw content
        # in exceptions. Never print these values to any log.
        print("Private offline media audit blocked; no contents or paths printed.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
