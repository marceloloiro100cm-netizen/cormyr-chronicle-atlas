"""Redacted comparison of pg_dump --schema-only SQL; outputs schema object headings, never bodies."""
import difflib
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

HEAD = re.compile(r'^-- Name: (.{1,300}?); Type: (.{1,100}?); Schema: (.{1,100}?); Owner: (.*)$')
TOKEN = re.compile(r'^\\(un)?restrict [A-Za-z0-9]+$')

def raw_sections(path):
    output = defaultdict(list)
    section = 'dump-preamble'
    for line in Path(path).read_text(encoding='utf-8').splitlines():
        if TOKEN.match(line):
            continue
        match = HEAD.match(line)
        if match:
            name, kind, schema, _owner = match.groups()
            # Only structural metadata; no SQL, values, code bodies, hashes, or owner.
            section = f'{kind}: {schema}.{name}'
        output[section].append(line)
    return dict(output)

def sections(path):
    raw = raw_sections(path)
    return {section: hashlib.sha256('\n'.join(lines).encode()).hexdigest()
            for section, lines in raw.items()}

def main():
    if len(sys.argv) != 3:
        raise SystemExit('Usage: temporal-schema-diff.py before.sql restored.sql')
    before, restored = (sections(arg) for arg in sys.argv[1:])
    changes = sorted(set(before) | set(restored))
    changed = [name for name in changes if before.get(name) != restored.get(name)]
    example = next((name for name in changed if name.startswith('TABLE: ')), None)
    differences = []
    if example:
        left = raw_sections(sys.argv[1]).get(example, [])
        right = raw_sections(sys.argv[2]).get(example, [])
        for line in difflib.unified_diff(left,right, n=1):
            if line.startswith(('+','-')) and not line.startswith(('+++','---')):
                # Only DDL from synthetic CI fixtures, never values or user backups.
                line = re.sub(r"'(?:''|[^'])*'", "'<literal>'", line)
                differences.append(line[:160])
                if len(differences) >= 20:
                    break
    print(json.dumps({
        'source': 'disposable-test-fixture',
        'private_content_output': False,
        'schema_sections_before': len(before),
        'schema_sections_restored': len(restored),
        'changed_section_count': len(changed),
        'changed_section_headers': changed[:25],
        'changed_headers_truncated': len(changed) > 25,
        'synthetic_table_example': example,
        'synthetic_table_ddl_delta': differences,
    }, ensure_ascii=False))

if __name__ == '__main__':
    main()
