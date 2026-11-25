// The in-process Google fake of the social sign-in tests (spec *Integration Coverage*, V-S04; #566). The ephemeral
// runner points the app's Google client at `http://127.0.0.1:$VEREINO_QA_OAUTH_FAKE_PORT` (`oauthFakeEnv`), and a spec
// starts this server on that port. The test queues the identity the next authorization answers with; `/authorize`
// binds it to a one-time code and the PKCE challenge and redirects back to the app's callback; `/token` checks the
// client credentials, the redirect URI and the verifier (S256) and answers an id token. The token's signature is a
// placeholder: the app does not verify it (V-S04 option 1, TLS back channel) — it checks iss, aud, exp and sub.
import { createHash, randomBytes } from 'node:crypto'
import http from 'node:http'

export const QA_GOOGLE_CLIENT_ID = 'vereino-qa-google-client'
const QA_GOOGLE_CLIENT_SECRET = 'fake-qa-google-secret'

/** What the next authorization answers: an identity, a refusal at the provider, or a token endpoint that misbehaves. */
export type FakeAuthorization = {
  sub?: string
  email?: string | null
  emailVerified?: boolean
  /** `deny`: the provider redirects back with `error=access_denied`; `hang`: the token endpoint never answers;
   * `error`: it answers 500; `foreign_audience`: the id token names another client. */
  behaviour?: 'ok' | 'deny' | 'hang' | 'error' | 'foreign_audience'
}

type IssuedCode = { authorization: FakeAuthorization; challenge: string; redirectUri: string }

export type GoogleFake = {
  /** Queues the answer of the next `/authorize`. */
  next(authorization: FakeAuthorization): void
  /** How many token requests reached the fake. */
  tokenRequests(): number
  stop(): Promise<void>
}

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url')
}

function idToken(claims: Record<string, unknown>): string {
  return `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'qa' }))}.${base64url(JSON.stringify(claims))}.${base64url('qa-signature')}`
}

function readBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8')
    })
    request.on('end', () => {
      resolve(body)
    })
    request.on('error', reject)
  })
}

function json(response: http.ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

export function fakePort(): number {
  const port = Number(process.env.VEREINO_QA_OAUTH_FAKE_PORT)
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(
      '[internal] VEREINO_QA_OAUTH_FAKE_PORT is not set: run the test through yarn test:integration:vereino',
    )
  }
  return port
}

export async function startGoogleFake(port: number = fakePort()): Promise<GoogleFake> {
  const queue: FakeAuthorization[] = []
  const codes = new Map<string, IssuedCode>()
  const hanging = new Set<http.ServerResponse>()
  let tokenCount = 0

  const server = http.createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${String(port)}`)
      if (request.method === 'GET' && url.pathname === '/authorize') {
        const redirectUri = url.searchParams.get('redirect_uri') ?? ''
        const state = url.searchParams.get('state') ?? ''
        const back = new URL(redirectUri)
        back.searchParams.set('state', state)
        const authorization = queue.shift() ?? { behaviour: 'deny' }
        if (
          url.searchParams.get('client_id') !== QA_GOOGLE_CLIENT_ID ||
          url.searchParams.get('code_challenge_method') !== 'S256' ||
          authorization.behaviour === 'deny'
        ) {
          back.searchParams.set('error', 'access_denied')
        } else {
          const code = randomBytes(16).toString('hex')
          codes.set(code, { authorization, challenge: url.searchParams.get('code_challenge') ?? '', redirectUri })
          back.searchParams.set('code', code)
        }
        response.writeHead(302, { location: back.toString() })
        response.end()
        return
      }
      if (request.method === 'POST' && url.pathname === '/token') {
        tokenCount += 1
        const form = new URLSearchParams(await readBody(request))
        const expectedAuth = `Basic ${Buffer.from(`${QA_GOOGLE_CLIENT_ID}:${QA_GOOGLE_CLIENT_SECRET}`).toString('base64')}`
        const issued = codes.get(form.get('code') ?? '')
        codes.delete(form.get('code') ?? '')
        const verifier = form.get('code_verifier') ?? ''
        const challenge = createHash('sha256').update(verifier).digest('base64url')
        if (
          request.headers.authorization !== expectedAuth ||
          !issued ||
          issued.redirectUri !== form.get('redirect_uri') ||
          issued.challenge !== challenge
        ) {
          json(response, 400, { error: 'invalid_grant' })
          return
        }
        const { authorization } = issued
        if (authorization.behaviour === 'hang') {
          hanging.add(response)
          return
        }
        if (authorization.behaviour === 'error') {
          json(response, 500, { error: 'server_error' })
          return
        }
        const now = Math.floor(Date.now() / 1000)
        json(response, 200, {
          access_token: randomBytes(16).toString('hex'),
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'openid email',
          id_token: idToken({
            iss: 'https://accounts.google.com',
            aud: authorization.behaviour === 'foreign_audience' ? 'another-client' : QA_GOOGLE_CLIENT_ID,
            sub: authorization.sub,
            email: authorization.email ?? undefined,
            email_verified: authorization.emailVerified ?? true,
            iat: now,
            exp: now + 3600,
          }),
        })
        return
      }
      json(response, 404, { error: 'not_found' })
    })().catch(() => {
      if (!response.headersSent) json(response, 500, { error: 'fake_failed' })
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      resolve()
    })
  })

  return {
    next(authorization) {
      queue.push({ behaviour: 'ok', ...authorization })
    },
    tokenRequests: () => tokenCount,
    async stop() {
      for (const response of hanging) response.destroy()
      hanging.clear()
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve()
        })
      })
    },
  }
}
