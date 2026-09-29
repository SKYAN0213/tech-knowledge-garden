import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"

test("knowledge histories resolve only verified fixed news paths without creating concept aliases", () => {
  const result = spawnSync("python3", ["-"], {
    encoding: "utf8",
    input: `
import sys, tempfile
from pathlib import Path
sys.path.insert(0, 'scripts')
from validate_encyclopedia import build_knowledge_catalog, validate_links
with tempfile.TemporaryDirectory() as temp:
    root = Path(temp)
    (root / 'Knowledge').mkdir()
    (root / 'Knowledge' / 'Term.md').write_text('---\\ntitle: Term\\nentry_type: concept\\n---\\nDefinition.')
    (root / 'News').mkdir()
    ids = ['abc1234567890001','abc1234567890002','abc1234567890003','abc1234567890004','abc1234567890005']
    for event, status, actual, kind in [(ids[0], 'verified', ids[0], 'news'), (ids[1], 'unreviewed', ids[1], 'news'), (ids[2], 'excluded', ids[2], 'news'), (ids[3], 'verified', ids[4], 'news'), (ids[4], 'verified', ids[4], 'knowledge')]:
        (root / 'News' / (event + '.md')).write_text('---\\ntitle: Term\\ntype: '+kind+'\\nschema_version: tech-news/v1\\nreview_status: '+status+'\\nevent_id: '+actual+'\\n---\\nNews')
    catalog, types = build_knowledge_catalog(root / 'Knowledge')
    assert catalog['Term'].parent.name == 'Knowledge'
    assert types[catalog['News/'+ids[0]]] == 'news'
    cases = [('News/'+ids[0], False, False), ('News/'+ids[0]+'.md#headline', False, False), ('News/'+ids[0], True, True), ('Term', True, False), (ids[0], False, True), ('News/../Knowledge/Term', False, True), ('News/missing', False, True)]
    cases.extend(('News/'+id, False, True) for id in ids[1:])
    for target, atomic, fail in cases:
        findings = []
        validate_links('[['+target+'|Link]]', root / 'Knowledge' / 'Term.md', catalog, types, findings, require_atomic=atomic)
        assert bool(findings) == fail, (target, findings)
`,
  })
  assert.equal(result.status, 0, result.stdout + result.stderr)
})
