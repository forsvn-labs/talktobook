import { test, expect } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Support } from '../src/components/support'
// Only an outbound voluntary link. No checkout, tracking, amount or entitlement.
test('support uses the verified owner destination without scripts or referrer',()=>{
 const html=renderToStaticMarkup(<Support/> )
 expect(html).toContain('href="https://github.com/sponsors/hungv47"')
 expect(html).toContain('rel="noopener noreferrer"')
 expect(html).toContain('optional')
 expect(html).toContain('Conversion stays free')
 expect(html).not.toMatch(/<script|<iframe|<form|utm_/)
})
