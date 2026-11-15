import hashlib
import importlib.util
import json
import stat
import tempfile
import unittest
import zipfile
from pathlib import Path


MODULE = Path(__file__).with_name("audit-local-media-coverage.py")
spec = importlib.util.spec_from_file_location("media_offline_coverage", MODULE)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class PrivateLocalMediaCoverageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.manifest = self.root / "private-manifest.json"
        self.images = self.root / "images.zip"
        self.newspapers = self.root / "newspapers.zip"
        self.secret = "PRIVATE-LETTER-NEVER-LOG-123456"
        self.sha = hashlib.sha256(self.secret.encode()).hexdigest()

    def write_manifest(self, complete=False, rows=None):
        data = {"version": 1, "bucket": "campaign-images", "complete": complete,
                "files": rows if rows is not None else [
                    {"path": "private-house-a/crest.jpg", "size": len(self.secret), "sha256": self.sha},
                    {"path": "private-house-b/crest.jpg", "size": len(self.secret), "sha256": self.sha},
                ]}
        self.manifest.write_text(json.dumps(data), encoding="utf-8")

    def write_zip(self, path, members):
        with zipfile.ZipFile(path, "w") as z:
            for filename, payload in members:
                z.writestr(filename, payload)

    def scan(self, others=None):
        inputs = {"campaign-images": [self.images]}
        if others:
            inputs.update(others)
        return audit.inspect_media_archives(self.manifest, inputs)

    def test_matches_duplicate_references_by_bytes_without_leaking_paths(self):
        self.write_manifest(complete=False)
        self.write_zip(self.images, [("unrelated-filename-without-extension", self.secret)])
        self.write_zip(self.newspapers, [("private-editor.jpg", "other-private-payload")])
        report = self.scan({"campaign-newspapers": [self.newspapers]})
        self.assertEqual(report["manifestReferences"], 2)
        self.assertEqual(report["manifestReferencesMatched"], 2)
        self.assertEqual(report["manifestUniqueContent"], 1)
        self.assertEqual(report["manifestReferencesMissingFromZips"], 0)
        self.assertFalse(report["imageArchiveCoverageComplete"])
        self.assertFalse(report["readyForCutover"])
        self.assertEqual(report["cloudWrites"], 0)
        printed = json.dumps(report)
        for secret in [self.secret, self.sha, "crest.jpg", "private-editor.jpg",
                       "private-house-a"]:
            self.assertNotIn(secret, printed)

    def test_complete_manifest_and_matching_content_is_archive_only_acceptance(self):
        self.write_manifest(complete=True)
        self.write_zip(self.images, [("some-file", self.secret)])
        report = self.scan()
        self.assertTrue(report["imageArchiveCoverageComplete"])
        self.assertFalse(report["pathMappingVerified"])
        self.assertFalse(report["destinationCloudVerified"])
        self.assertFalse(report["readyForCutover"])

    def test_missing_or_extra_content_is_counted_not_exported(self):
        self.write_manifest(complete=True)
        self.write_zip(self.images, [("other-file", "different secret")])
        report = self.scan()
        self.assertEqual(report["manifestReferencesMissingFromZips"], 2)
        self.assertEqual(report["manifestUniqueContentMissingFromZips"], 1)
        self.assertEqual(report["zipContentNotInManifest"], 1)
        self.assertFalse(report["imageArchiveCoverageComplete"])

    def test_duplicate_manifest_path_and_invalid_digest_block(self):
        self.write_manifest(rows=[
            {"path": "same.jpg", "size": 1, "sha256": "a" * 64},
            {"path": "same.jpg", "size": 1, "sha256": "b" * 64},
        ])
        self.write_zip(self.images, [("valid.jpg", b"a")])
        with self.assertRaises(audit.PrivateAuditError):
            self.scan()
        self.write_manifest(rows=[{"path": "secret.jpg", "size": 1, "sha256": "not-a-hash"}])
        with self.assertRaises(audit.PrivateAuditError):
            self.scan()

    def test_zip_traversal_and_symlink_members_fail_closed(self):
        self.write_manifest()
        self.write_zip(self.images, [("../escape.txt", self.secret)])
        with self.assertRaises(audit.PrivateAuditError):
            self.scan()
        symlink = zipfile.ZipInfo("unsafe-link")
        symlink.create_system = 3
        symlink.external_attr = (stat.S_IFLNK | 0o777) << 16
        with zipfile.ZipFile(self.images, "w") as z:
            z.writestr(symlink, self.secret)
        with self.assertRaises(audit.PrivateAuditError):
            self.scan()

    def test_corrupt_zip_crc_is_never_accepted(self):
        self.write_manifest()
        self.write_zip(self.images, [("single.txt", self.secret)])
        payload = bytearray(self.images.read_bytes())
        pos = payload.find(self.secret.encode())
        self.assertNotEqual(pos, -1)
        payload[pos] = ord("X")
        self.images.write_bytes(payload)
        with self.assertRaises((zipfile.BadZipFile, OSError)):
            self.scan()

    def test_buckets_and_cli_accept_only_local_explicit_inputs(self):
        self.write_manifest()
        self.write_zip(self.images, [("data", self.secret)])
        with self.assertRaises(audit.PrivateAuditError):
            audit.inspect_media_archives(self.manifest, {"unknown-private-bucket": [self.images],
                                                         "campaign-images": [self.images]})
        self.assertEqual(audit.main(["--manifest", str(self.manifest),
                                     "--campaign-images-zip", str(self.images)]), 1)


if __name__ == "__main__":
    unittest.main()
