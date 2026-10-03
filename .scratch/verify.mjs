/**
 * Local verification tool (not part of the plugin):
 * reads exactly what the running Harness serves for this bundle's client half,
 * so a fix can be confirmed without asking the user to try the UI.
 *
 * It mints the Host's own browser-session cookie from
 * ~/.dsh/.credentials.yaml (the same grant the embedded browser uses). The
 * secret is never printed.
 *
 * Usage: node .scratch/verify.mjs [marker ...]
 */
import { createHash, createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'

const workspace = new URL('../', import.meta.url)
const base = process.env.DSH_WEB_URL ?? 'http://127.0.0.1:19387'
const credentialsPath = (process.env.DSH_HOME ?? process.env.HOME + '/.dsh') + '/.credentials.yaml'

const secretB64 = /client-connection\/browser-session:[\s\S]*?secret:\s*(\S+)/.exec(readFileSync(credentialsPath, 'utf8'))?.[1]
if (secretB64 === undefined) throw new Error('no browser-session grant in ' + credentialsPath)

const secret = Buffer.from(secretB64, 'base64url')
const b64 = (value) => Buffer.from(value).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
const authority = new URL(base).host
const cookieName = 'dsh-auth-' + b64(createHash('sha256').update(authority).digest())
const now = Date.now()
const body = b64(JSON.stringify({ version: 1, authority, issuedAt: now, expiresAt: now + 3_600_000 }))
const cookie = `${cookieName}=v1.${body}.${b64(createHmac('sha256', secret).update(body).digest())}`
const get = async (path) => {
  const response = await fetch(base + path, { headers: { cookie } })
  return { status: response.status, text: await response.text() }
}

const root = await get('/')
const row = /{"id":"@local\/dsh-models-usage","url":"([^"]+)"[^}]*"rev":"([^"]+)"/.exec(root.text)
if (row === null) throw new Error('the bundle is not in the live boot graph')
const served = await get('/' + row[1])
const local = readFileSync(new URL('lib/client.js', workspace), 'utf8')

console.log('live rev        :', row[2])
console.log('served bytes    :', served.status, served.text.length)
console.log('matches workspace:', served.text.replace(/\n?;?\n?\/\/# sourceMappingURL=.*\n?$/s, '').trim() === local.trim())
for (const marker of process.argv.slice(2)) {
  console.log(`marker ${JSON.stringify(marker)}: served=${served.text.includes(marker)} local=${local.includes(marker)}`)
}
