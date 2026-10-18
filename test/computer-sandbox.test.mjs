import test from 'node:test';
import assert from 'node:assert/strict';
import {computerDocument} from '../src/cell/sandbox.js';
test('generated app document enforces CSP before app markup and denies network resource types',()=>{
 const app='<html><head><meta http-equiv="Content-Security-Policy" content="default-src *"></head><body><script>document.body.dataset.ready="yes"</script></body></html>';
 const html=computerDocument(app);
 assert(html.indexOf("default-src 'none'")<html.indexOf('default-src *'));
 for(const directive of ["connect-src 'none'","form-action 'none'","base-uri 'none'","frame-src 'none'","worker-src 'none'"])assert(html.includes(directive));
 assert(html.includes('document.body.dataset.ready'));
});
