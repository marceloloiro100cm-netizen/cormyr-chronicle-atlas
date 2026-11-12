"""Inspect pg_restore text output without executing SQL. Outputs metadata only by default."""
import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

IDENT = r'(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z_0-9$]*)'
HEADER = re.compile(r'^COPY (' + IDENT + r')\.(' + IDENT + r') \((.*)\) FROM stdin;$')

def identifier(value):
    return value[1:-1].replace('""', '"') if value.startswith('"') else value

def decode_copy(value):
    if value == r'\N':
        return None
    # Decode COPY escapes as bytes, preserving UTF-8 and literal backslashes.
    result = bytearray()
    source = value.encode('utf-8')
    i = 0
    simple = {ord('b'):8, ord('f'):12, ord('n'):10, ord('r'):13, ord('t'):9, ord('v'):11}
    while i < len(source):
        char = source[i]
        if char != 92:
            result.append(char); i += 1; continue
        i += 1
        if i == len(source):
            raise ValueError('Incomplete COPY escape')
        char = source[i]
        if 48 <= char <= 55:
            end = i + 1
            while end < min(i + 3, len(source)) and 48 <= source[end] <= 55:
                end += 1
            number = int(source[i:end], 8)
            if number > 255: raise ValueError('COPY octal escape outside byte range')
            result.append(number); i = end
        elif char == ord('x'):
            end = i + 1
            while end < min(i + 3, len(source)) and chr(source[end]) in '0123456789abcdefABCDEF':
                end += 1
            if end == i + 1: raise ValueError('Empty COPY hex escape')
            result.append(int(source[i+1:end], 16)); i = end
        else:
            result.append(simple.get(char,char)); i += 1
    return result.decode('utf-8')

def read_tables(path):
    tables = {}
    active = None
    with Path(path).open(encoding='utf-8', newline='') as stream:
        for number, raw in enumerate(stream,1):
            line = raw.removesuffix('\n').removesuffix('\r')
            if active is not None:
                if line == r'\.':
                    active = None
                    continue
                values = line.split('\t')
                columns = tables[active]['columns']
                if len(values) != len(columns):
                    raise ValueError(f'COPY column count mismatch at line {number}')
                tables[active]['rows'].append(dict(zip(columns,map(decode_copy,values))))
            elif line.startswith('COPY '):
                match = HEADER.fullmatch(line)
                if not match: raise ValueError(f'Unsupported COPY header at line {number}')
                schema,table,raw_columns = match.groups()
                key = identifier(schema) + '.' + identifier(table)
                if key in tables: raise ValueError('Duplicate COPY table')
                columns = re.findall(IDENT,raw_columns)
                if re.sub(IDENT,'',raw_columns).replace(',','').strip():
                    raise ValueError('Invalid column list')
                columns = list(map(identifier,columns))
                if len(set(columns)) != len(columns): raise ValueError('Duplicate column')
                tables[key] = {'columns':columns,'rows':[]}
                active = key
    if active is not None: raise ValueError('Truncated COPY data')
    if not tables: raise ValueError('No COPY data found; expected pg_restore --data-only output')
    return tables

def audit(tables):
    users = tables.get('auth.users',{}).get('rows',[])
    objects = tables.get('storage.objects',{}).get('rows',[])
    counts = {name:len(table['rows']) for name,table in sorted(tables.items())}
    algorithms = Counter()
    for row in users:
        password = row.get('encrypted_password') or ''
        algorithms['bcrypt' if re.fullmatch(r'\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}',password) else 'empty' if not password else 'unsupported'] += 1
    return {
        'formatVersion':1, 'scope':'backup-only', 'liveSourceCompared':False,
        'tableCount':len(tables), 'rowCount':sum(counts.values()), 'rowsByTable':counts,
        'auth':{'users':len(users), 'passwordAlgorithms':dict(algorithms),
                'uniqueUids':len(set(r.get('id') for r in users))},
        'storage':{'objectReferences':len(objects),'binaryFilesVerified':0},
        'newspaperTables':[name for name in counts if 'newspaper' in name],
        'readyForCutover':False,
        'blockers':['Live source and final delta not reconciled','Storage binaries absent from SQL export',
                    'Firebase adapters and authorization not migrated or accepted','Destination import not executed'],
    }

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('sql',type=Path)
    parser.add_argument('--private-export',type=Path,help='Create a NEW private directory with lossless text/null rows; never commit it')
    args = parser.parse_args()
    tables = read_tables(args.sql)
    report = audit(tables)
    report['sqlSha256'] = hashlib.sha256(args.sql.read_bytes()).hexdigest()
    if args.private_export:
        args.private_export.mkdir(mode=0o700,parents=True,exist_ok=False)
        manifest = []
        for index,(name,table) in enumerate(sorted(tables.items())):
            # Numeric filenames prevent SQL identifiers from becoming path traversal.
            path = args.private_export / f'{index:03d}.json'
            payload = json.dumps({'sourceTable':name,**table},ensure_ascii=False).encode('utf-8')
            path.touch(mode=0o600,exist_ok=False)
            path.write_bytes(payload)
            manifest.append({'table':name,'file':path.name,'rows':len(table['rows']),
                             'sha256':hashlib.sha256(payload).hexdigest()})
        out = args.private_export / 'manifest.json'
        out.touch(mode=0o600,exist_ok=False)
        out.write_text(json.dumps({'formatVersion':1,'valueEncoding':'postgres-copy-text-or-null',
                                  'tables':manifest,'audit':report},indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2))

if __name__ == '__main__': main()
