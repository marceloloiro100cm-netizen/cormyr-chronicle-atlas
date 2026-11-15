import io
import os
import stat
import tempfile
import unittest
import zipfile
from pathlib import Path

from extract_private_pg_backup import extract_private_backup


class PrivatePgDumpExtractionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.private = self.root / "private"
        self.private.mkdir(mode=0o700)
        self.src = self.root / "backup.zip"
        self.dst = self.private / "backup.backup"

    def tearDown(self):
        self.temp.cleanup()

    def make_zip(self, entries):
        with zipfile.ZipFile(self.src, "w", compression=zipfile.ZIP_DEFLATED) as z:
            for name, body in entries:
                z.writestr(name, body)

    def test_extracts_one_pg_custom_dump_without_exposing_content(self):
        self.make_zip([("cormyr-chronicle-atlas_261112.backup", b"PGDMP" + b"private" * 100)])
        r = extract_private_backup(self.src, self.dst)
        self.assertTrue(r["extracted"])
        self.assertFalse(r["databaseWritten"])
        self.assertEqual(self.dst.read_bytes()[:5], b"PGDMP")
        self.assertEqual(self.dst.stat().st_mode & 0o777, 0o600)
        self.assertNotIn("private", str(r))
        with self.assertRaises(FileExistsError):
            extract_private_backup(self.src, self.dst)

    def test_rejects_more_than_one_entry_and_traversal_member(self):
        self.make_zip([("a.backup", b"PGDMPa"), ("b.backup", b"PGDMPb")])
        with self.assertRaises(ValueError):
            extract_private_backup(self.src, self.dst)
        self.make_zip([("../private.backup", b"PGDMPsecret")])
        with self.assertRaises(ValueError):
            extract_private_backup(self.src, self.dst)
        self.assertFalse(self.dst.exists())

    def test_rejects_unexpected_format_and_cleans_failed_output(self):
        self.make_zip([("source.backup", b"not-postgres")])
        with self.assertRaises(ValueError):
            extract_private_backup(self.src, self.dst)
        self.assertFalse(self.dst.exists())

    def test_rejects_public_output_directory(self):
        self.make_zip([("source.backup", b"PGDMPsome-data")])
        public = self.root / "public"
        public.mkdir(mode=0o755)
        with self.assertRaises(ValueError):
            extract_private_backup(self.src, public / "source.backup")

    def test_rejects_symlink_entry_and_symlink_zip(self):
        info = zipfile.ZipInfo("symlink.backup")
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        with zipfile.ZipFile(self.src, "w") as z:
            z.writestr(info, b"PGDMPfake")
        with self.assertRaises(ValueError):
            extract_private_backup(self.src, self.dst)
        real = self.root / "real.zip"
        self.src.rename(real)
        self.src.symlink_to(real)
        with self.assertRaises(ValueError):
            extract_private_backup(self.src, self.dst)


if __name__ == "__main__":
    unittest.main()
