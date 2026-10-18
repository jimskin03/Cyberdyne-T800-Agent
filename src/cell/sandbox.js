// This policy applies before any generated markup and cannot be loosened by it.
export const COMPUTER_CSP="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
export function computerDocument(html){
 return '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="'+COMPUTER_CSP+'"><meta charset="utf-8"></head><body>'+String(html)+'</body></html>';
}
