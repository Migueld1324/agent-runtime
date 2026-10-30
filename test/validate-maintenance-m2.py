"""Run M2 checks in a new disposable checkout, never against checkout data/.
Run with Python 3 from the repository. Evidence and inputs are retained.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

source = Path(__file__).resolve().parents[1]
evidence = source / 'docs/delivery/evidence'
checkout = Path(tempfile.mkdtemp(prefix='.adr088-m2-resume-', dir=source))
for name in ('src', 'test', 'examples'):
    shutil.copytree(source / name, checkout / name)
for name in ('package.json', 'package-lock.json', 'tsconfig.json'):
    shutil.copy2(source / name, checkout / name)
(checkout / 'node_modules').symlink_to(source / 'node_modules', target_is_directory=True)
(checkout / 'tmp').mkdir(mode=0o700)
env = dict(os.environ, TMPDIR=str(checkout / 'tmp'))
# The integrations use mock by default; do not propagate provider credentials.
for key in list(env):
    if any(word in key for word in ('API_KEY', 'ACCESS_TOKEN', 'AUTH_TOKEN')):
        del env[key]
results = {}
for task in ('typecheck', 'test:core', 'test:integration', 'test:v2:integration', 'test:v3:integration'):
    with (evidence / ('adr088-m2-resume-' + task.replace(':', '-') + '.txt')).open('w') as output:
        result = subprocess.run(['npm', 'run', task], cwd=checkout, env=env, stdout=output, stderr=subprocess.STDOUT)
    results[task] = result.returncode
    print(task, result.returncode, flush=True)
with (evidence / 'adr088-m2-resume-real-store-inspection.txt').open('w') as output:
    result = subprocess.run(['node', '--disable-warning=ExperimentalWarning', '--experimental-strip-types',
        'test/maintenance-integration-inspection.ts'], cwd=checkout, env=env, stdout=output, stderr=subprocess.STDOUT)
results['real-store-inspection'] = result.returncode
print('real-store-inspection', result.returncode, flush=True)
(evidence / 'adr088-m2-resume-environment.json').write_text(json.dumps({
    'checkout': str(checkout), 'testTemporaryDirectory': str(checkout / 'tmp'),
    'node': subprocess.check_output(['node', '-v'], text=True).strip(),
    'kernel': os.uname().release,
    'filesystem': subprocess.check_output(['stat', '-f', '-c', '%T', checkout], text=True).strip(),
    'results': results,
}, indent=2) + '\n')
files = sorted(p for folder in ('src', 'test') for p in (checkout / folder).rglob('*') if p.is_file())
(evidence / 'adr088-m2-resume-source-digests.json').write_text(json.dumps({
    str(p.relative_to(checkout)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files
}, indent=2) + '\n')
print('Retained checkout:', checkout, flush=True)
raise SystemExit(int(any(results.values())))
