"""Redacted comparison of pg_dump --schema-only SQL; outputs schema object headings, never bodies."""
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

HEAD = re.compile(r'^-- Name: (.{1,300}?); Type: (.{1,100}?); Schema: (.{1,100}?); Owner: (.*)$')
TOKEN = re.compile(r'^\\(un)?restrict [A-Za-z0-9]+$')

def sections(path):
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
    return {section: hashlib.sha256('\n'.join(lines).encode()).hexdigest()
            for section, lines in output.items()}

def main():
    if len(sys.argv) != 3:
        raise SystemExit('Usage: temporal-schema-diff.py before.sql restored.sql')
    before, restored = (sections(arg) for arg in sys.argv[1:])
    changes = sorted(set(before) | set(restored))
    changed = [name for name in changes if before.get(name) != restored.get(name)]
    print(json.dumps({
        'source': 'disposable-test-fixture',
        'private_content_output': False,
        'schema_sections_before': len(before),
        'schema_sections_restored': len(restored),
        'changed_section_count': len(changed),
        'changed_section_headers': changed[:25],
        'changed_headers_truncated': len(changed) > 25,
    }, ensure_ascii=False))

if __name__ == '__main__':
    main()
