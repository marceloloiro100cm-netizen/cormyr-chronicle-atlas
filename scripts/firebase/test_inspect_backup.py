import tempfile
import unittest
from pathlib import Path
from inspect_backup import read_tables, decode_copy, audit

class BackupTests(unittest.TestCase):
    def parse(self,text):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)/'source.sql';p.write_text(text)
            return read_tables(p)

    def test_empty_table_does_not_swallow_next_section(self):
        tables=self.parse('COPY public.empty (id) FROM stdin;\n\\.\n\n-- comment\nCOPY public.full (id, body) FROM stdin;\n1\ttext\\nline\n\\.\n')
        self.assertEqual(len(tables['public.empty']['rows']),0)
        self.assertEqual(tables['public.full']['rows'][0]['body'],'text\nline')

    def test_null_literal_backslash_and_unicode(self):
        self.assertIsNone(decode_copy(r'\N'))
        self.assertEqual(decode_copy(r'\\N'),r'\N')
        self.assertEqual(decode_copy('ação\\t\\134'),'ação\t\\')
        self.assertEqual(decode_copy(r'\xc3\xa7'),'ç')
        self.assertEqual(decode_copy(''), '')

    def test_truncated_or_wrong_columns_rejected(self):
        with self.assertRaises(ValueError): self.parse('COPY public.x (id) FROM stdin;\n1\n')
        with self.assertRaises(ValueError): self.parse('COPY public.x (id) FROM stdin;\n1\t2\n\\.\n')
        with self.assertRaises(ValueError): self.parse('SELECT 1;\n')

    def test_quoted_identifiers(self):
        result=self.parse('COPY "public"."strange" ("some id", body) FROM stdin;\n1\t\\N\n\\.\n')
        self.assertEqual(result['public.strange']['rows'],[{'some id':'1','body':None}])

    def test_audit_does_not_emit_secrets(self):
        result=audit({'auth.users':{'columns':[], 'rows':[{'id':'secret-id','email':'secret-email','encrypted_password':'secret-password'}]}})
        self.assertEqual(result['auth']['passwordAlgorithms'],{'unsupported':1})
        self.assertNotIn('secret',str(result))
        self.assertFalse(result['readyForCutover'])

if __name__=='__main__': unittest.main()
