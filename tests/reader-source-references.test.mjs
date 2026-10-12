import test from 'node:test';
import assert from 'node:assert/strict';
import {makeResolver,projectLinks} from '../scripts/links.mjs';
const current='Knowledge/AI Systems/Air-Gapped Deployment';
const source='https://example.org/original';
const note={path:current,meta:{title:'Air-Gapped Deployment'}};
const missing='../../News/0123456789abcdef.md';
const resolve=makeResolver([note]);
const allowed=new Set([current]);
test('a reviewed source remains readable when its older News page is outside the publication',()=>{
  const body=`Source-backed fact. [기사](${missing}) · [원문](${source})`;
  assert.equal(projectLinks(body,current,resolve,allowed,{verifiedSources:[source]}),`Source-backed fact. 기사 · [원문](${source})`);
});
test('a missing News target without an exact verified source on its own line fails',()=>{
  for(const body of [`[기사](${missing})`,`[기사](${missing})\n[원문](${source})`,`[기사](${missing}) · [원문](https://other.example/original)`])
    assert.throws(()=>projectLinks(body,current,resolve,allowed,{verifiedSources:[source]}),/Unresolved link/);
});
test('missing knowledge links are not treated as unpublished news',()=>{
  assert.throws(()=>projectLinks(`[개념](Other.md) · [원문](${source})`,current,resolve,allowed,{verifiedSources:[source]}),/Unresolved link/);
});
test('existing news keeps its normal public destination',()=>{
  const news={path:'News/0123456789abcdef',meta:{title:'Existing article'}};
  assert.equal(projectLinks(`[기사](${missing}) · [원문](${source})`,current,makeResolver([note,news]),new Set([current,news.path]),{verifiedSources:[source]}),`[[News/0123456789abcdef|기사]] · [원문](${source})`);
});
