# coding: utf-8
"""Run standalone AFTER Node/MCP suites exit: python3 -m unittest discover -s tests -p test_research_fixture_metadata_repair.py.
All catalogs, payloads and process helpers are synthetic temporary fixtures.
Positive acceptance always uses the actual native CLI and actual system ps.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import sqlite3
import subprocess
import sys
import tempfile
import unittest
import uuid

REPO = Path(__file__).resolve().parents[1]
RUNNER = REPO / 'scripts/research/cold-storage.py'
SPEC = importlib.util.spec_from_file_location('fixture_storage', RUNNER)
STORAGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(STORAGE)

def raw(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode()

def sha(value):
    return hashlib.sha256(value).hexdigest()

class FixtureRepair(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='garden-fixture-repair-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.db = STORAGE.connect(self.root)
        self.addCleanup(self.db.close)
        STORAGE.initialize(self.root, {'enabled': False, 'cache_bytes': 32 * 1024 ** 3})
        self.rows = []
        self.owners = []
        for index in range(33):
            scope = 'research/mcp-module-test-T%05d' % index
            self.rows.append({'path': scope + '/module-jobs/module-mcp-inventory/result.json',
                              'sha256': sha(('result-%d' % index).encode()), 'bytes': 271211,
                              'mode': 384, 'mtime_ns': str(1000000000 + index), 'scope': None, 'cached_at': None})
            self.owners.append({'scope': scope, 'identity': 'owner_identity_unavailable'})
        self.rows.sort(key=lambda row: row['path'])
        for row in self.rows:
            self.db.execute('INSERT INTO files VALUES(?,?,?,?,?,?,?)', tuple(row[k] for k in ('path','sha256','bytes','mode','mtime_ns','scope','cached_at')))
        source = self.root / 'research/local-ai/documents/original/body.bin'
        source.parent.mkdir(parents=True)
        source.write_bytes(b'actual original must remain byte-identical')
        self.source_sha = sha(source.read_bytes())
        self.db.execute('INSERT INTO files VALUES(?,?,?,?,?,?,?)', (str(source.relative_to(self.root)), self.source_sha, source.stat().st_size, 384, '1', None, None))
        self.db.commit()
        self.operation = uuid.uuid4().hex
        self.params = {'expected_root': str(self.root), 'operator': 'isolated-regression',
                       'reason': 'Exact synthetic missing test-only metadata repair', 'operation_id': self.operation}
        self.write_manifest()
        self.initial = self.catalog_rows()

    def catalog_rows(self):
        return [dict(row) for row in self.db.execute('SELECT * FROM files ORDER BY path')]

    def write_manifest(self):
        self.manifest = {'schema': 'research-missing-fixture-repair/v1', 'root': str(self.root),
                         'expected_count': len(self.rows), 'rows': self.rows,
                         'rowset_sha256': sha(raw(self.rows)), 'owners': self.owners}
        path = self.root / 'research/repair-input/manifest.json'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw(self.manifest))
        self.params['manifest'] = {'path': str(path.relative_to(self.root)), 'sha256': sha(path.read_bytes())}

    def cli(self, action='repair-missing-fixture-records', params=None, env=None):
        # A real regular fd provides definite EOF, matching the native JS wrapper.
        with tempfile.TemporaryFile() as stdin:
            stdin.write(raw(params or self.params)); stdin.seek(0)
            return subprocess.run([sys.executable, str(RUNNER), action, '--root', str(self.root)],
                                  stdin=stdin, capture_output=True, timeout=30, env=env)

    def reject_unchanged(self, env=None):
        before = self.catalog_rows()
        result = self.cli(env=env)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual(self.catalog_rows(), before)
        return result

    def helper(self, scope=None):
        child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(120)',
                                  *(['--root', str(self.root / scope)] if scope else [])])
        def cleanup():
            if child.poll() is None:
                child.terminate()
            child.wait(timeout=10)
        self.addCleanup(cleanup)
        return child

    def retained_owner(self, pid):
        owner = self.owners[0]
        relative = owner['scope'] + '/module-jobs/module-mcp-inventory/state.json'
        state = {'schema': 'research-module-job/v1', 'job_id': 'module-mcp-inventory', 'pid': pid,
                 'state': 'completed', 'result': {'path': 'module-jobs/module-mcp-inventory/result.json', 'sha256': self.rows[0]['sha256']}}
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw(state))
        self.owners[0] = {'scope': owner['scope'], 'identity': 'retained_native_owner', 'pid': pid,
                          'state': {'path': relative, 'sha256': sha(path.read_bytes())}}
        self.write_manifest()

    def test_exact_33_rows_actual_cli_ps_preserves_original_and_unrelated_row_sha(self):
        child = subprocess.Popen([sys.executable, '-c', 'pass']); child.wait(timeout=10)
        self.retained_owner(child.pid)  # Real observed child exit, then native ESRCH probe.
        result = self.cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        value = json.loads(result.stdout)
        self.assertEqual(value['commit_marker']['deleted'], 33)
        self.assertEqual(value['commit_marker']['counts_before']['files'], 34)
        self.assertEqual(value['commit_marker']['counts_after']['files'], 1)
        self.assertEqual(self.catalog_rows(), [row for row in self.initial if not row['path'].startswith('research/mcp-module-test-')])
        self.assertEqual(sha((self.root / 'research/local-ai/documents/original/body.bin').read_bytes()), self.source_sha)
        self.assertEqual(STORAGE.policy(self.root)['cache_bytes'], 32 * 1024 ** 3)
        directory = self.root / '.storage/fixture-metadata-repairs' / self.operation
        before = json.loads((directory / 'before.json').read_bytes())
        self.assertEqual(sum(o['identity'] == 'owner_identity_unavailable' for o in before['owners']), 32)
        for probe in before['process_evidence']:
            self.assertEqual(probe['status'], 0)
            self.assertGreater(probe['row_count'], 0)
            self.assertRegex(probe['stdout_sha256'], r'^[a-f0-9]{64}$')
            self.assertNotIn('stdout', probe)
        self.assertEqual((directory / 'before.json').stat().st_mode & 0o777, 0o600)
        before_receipt = (directory / 'receipt.json').read_bytes()
        self.assertNotEqual(self.cli().returncode, 0)  # Never repeat the DELETE.
        self.assertEqual((directory / 'receipt.json').read_bytes(), before_receipt)
        readback = self.cli(params={**self.params, 'readback_only': True})
        self.assertEqual(readback.returncode, 0, readback.stderr)
        self.assertEqual(json.loads(readback.stdout)['status'], 'committed_readback')

    def test_existing_payload_is_preserved(self):
        target = self.root / self.rows[0]['path']; target.parent.mkdir(parents=True); target.write_bytes(b'existing')
        self.reject_unchanged(); self.assertEqual(target.read_bytes(), b'existing')

    def test_source_path_cannot_be_repaired_even_with_matching_rowset(self):
        self.rows[0]['path'] = 'research/local-ai/documents/missing/body.bin'
        self.rows.sort(key=lambda row: row['path']); self.write_manifest(); self.reject_unchanged()

    def test_catalog_sha_tamper_is_rejected(self):
        self.db.execute('UPDATE files SET sha256=? WHERE path=?', ('a' * 64, self.rows[0]['path'])); self.db.commit()
        self.reject_unchanged()

    def test_manifest_sha_tamper_is_rejected(self):
        path = self.root / self.params['manifest']['path']; path.write_bytes(path.read_bytes() + b' ')
        self.reject_unchanged()

    def test_objects_prevent_deletion_even_when_remote_unverified(self):
        self.db.execute('INSERT INTO bundles(id,kind,sha256,bytes) VALUES(?,?,?,?)', ('unverified','zip','b'*64,1))
        self.db.execute('INSERT INTO objects VALUES(?,?,?,?)', (self.rows[0]['sha256'],271211,'unverified','member'))
        self.db.commit(); self.reject_unchanged()

    def test_requests_prevent_deletion(self):
        self.db.execute('INSERT INTO requests VALUES(?,?,?,?,?,?)', ('requested', self.rows[0]['path'], self.rows[0]['sha256'], 'bundle', '2026-10-22T00:00:00Z', 'pending'))
        self.db.commit(); self.reject_unchanged()

    def test_existing_mutation_lock_is_not_recovered_or_deleted(self):
        lock = self.root / '.storage/mutation.lock'; lock.write_bytes(raw({'pid':os.getpid(),'started_at':STORAGE.now()}))
        old = lock.read_bytes(); self.reject_unchanged(); self.assertEqual(lock.read_bytes(), old)

    def test_actual_scope_writer_is_rejected(self):
        child = self.helper(self.owners[0]['scope'])
        self.assertIsNone(child.poll()); self.reject_unchanged()

    def test_retained_owner_still_alive_is_rejected_even_if_scope_not_in_argv(self):
        child = self.helper(); self.retained_owner(child.pid); self.reject_unchanged()

    def test_ps_failure_is_not_treated_as_zero_writers(self):
        # Negative-only executable failure injection. No fake successful ps is used.
        directory = self.root / 'failed-ps'; directory.mkdir()
        ps = directory / 'ps'; ps.write_text('#!/bin/sh\nexit 77\n'); ps.chmod(0o700)
        result = self.reject_unchanged(env={**os.environ, 'PATH':str(directory) + os.pathsep + os.environ.get('PATH','')})
        self.assertIn(b'77', result.stderr)

    def kill_at_boundary(self, filename):
        # Separate real process + real ps; inject only termination at a durable I/O boundary.
        wrapper = self.root / 'interrupt-native.py'
        wrapper.write_text('''import importlib.util,json,os,signal,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location("storage",sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
root=Path(sys.argv[2]);p=json.loads(Path(sys.argv[3]).read_text());original=m.immutable_bytes
def boundary(path,data):
    if path.name==sys.argv[4] and path.name=="receipt.json": os.kill(os.getpid(),signal.SIGKILL)
    original(path,data)
    if path.name==sys.argv[4]: os.kill(os.getpid(),signal.SIGKILL)
m.immutable_bytes=boundary
with m.exclusive(root): m.repair_missing_fixture_records(root,p)
''')
        parameters = self.root / 'interrupt-input.json'; parameters.write_bytes(raw(self.params))
        child = subprocess.Popen([sys.executable,str(wrapper),str(RUNNER),str(self.root),str(parameters),filename], stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        stdout,stderr = child.communicate(timeout=30)
        self.assertEqual(child.returncode, -signal.SIGKILL, (stdout,stderr))
        lock = self.root / '.storage/mutation.lock'; original_lock = lock.read_bytes()
        recovery = self.cli('recover-mutation-lock', {'expected_root':str(self.root),'expected_pid':child.pid,
                             'expected_lock_sha256':sha(original_lock),'operator':'isolated-regression',
                             'reason':'Exact helper process terminated at durable boundary'})
        self.assertEqual(recovery.returncode,0,recovery.stderr)
        receipt = json.loads(recovery.stdout)
        self.assertEqual((self.root / receipt['receipt_path']).is_file(),True)

    def test_commit_then_kill_before_receipt_explicit_readback_no_second_delete(self):
        self.kill_at_boundary('receipt.json')
        self.assertEqual(len(self.catalog_rows()),1)
        directory=self.root/'.storage/fixture-metadata-repairs'/self.operation
        self.assertTrue((directory/'before.json').is_file());self.assertFalse((directory/'receipt.json').exists())
        self.assertNotEqual(self.cli().returncode,0)
        result=self.cli(params={**self.params,'readback_only':True})
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(json.loads(result.stdout)['commit_marker']['deleted'],33)
        self.assertTrue(list(directory.glob('readback-*.json')))

    def test_kill_before_commit_rolls_back_and_keeps_attempt(self):
        self.kill_at_boundary('before.json')
        self.assertEqual(self.catalog_rows(),self.initial)
        self.assertNotEqual(self.cli().returncode,0)
        self.assertNotEqual(self.cli(params={**self.params,'readback_only':True}).returncode,0)
        self.assertTrue((self.root/'.storage/fixture-metadata-repairs'/self.operation/'before.json').is_file())

if __name__=='__main__':
    unittest.main()
