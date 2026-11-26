// The in-process OAuth fake of the social sign-in tests (spec *Integration Coverage*, V-S04; #566, Facebook #567). The
// ephemeral runner points the app's Google and Facebook clients at `http://127.0.0.1:$VEREINO_QA_OAUTH_FAKE_PORT`
// (`oauthFakeEnv`), and a spec starts this server on that port (the suite runs with one worker, so one server at a
// time). The test queues the identity the next authorization answers with, whichever provider asks.
// - Google (`/authorize`, `/token`): `/authorize` binds the identity to a one-time code and the PKCE challenge and
//   redirects back to the app's callback; `/token` checks the client credentials (Basic), the redirect URI and the
//   verifier (S256) and answers an id token. Its signature is a placeholder: the app does not verify it (V-S04 option
//   1, TLS back channel) — it checks iss, aud, exp and sub.
// - Facebook (`/facebook/dialog/oauth`, `/facebook/oauth/access_token`, `/facebook/me`): the same authorization step;
//   the token endpoint checks the credentials in the form body, the redirect URI and the verifier and answers an
//   access token; `/me` checks the bearer token and its `appsecret_proof` and answers `{ id, email? }`.
import { createHash, createHmac, randomBytes } from 'node:crypto'
import http from 'node:http'

export const QA_GOOGLE_CLIENT_ID = 'vereino-qa-google-client'
const QA_GOOGLE_CLIENT_SECRET = 'fake-qa-google-secret'
export const QA_FACEBOOK_CLIENT_ID = 'vereino-qa-facebook-client'
const QA_FACEBOOK_CLIENT_SECRET = 'fake-qa-facebook-secret'

type FakeProvider = 'google' | 'facebook'

/** What the next authorization answers: an identity, a refusal at the provider, or a token endpoint that misbehaves. */
export type FakeAuthorization = {
  sub?: string
  /** Null or absent: no e-mail (Facebook shares none without the permission or a confirmed address). */
  email?: string | null
  emailVerified?: boolean
  /** `deny`: the provider redirects back with `error=access_denied`; `hang`: the token endpoint never answers;
   * `error`: it answers 500; `foreign_audience`: the id token names another client (Google); `me_error`: Graph
   * `/me` answers 500 (Facebook). */
  behaviour?: 'ok' | 'deny' | 'hang' | 'error' | 'foreign_audience' | 'me_error'
}

type IssuedCode = { provider: FakeProvider; authorization: FakeAuthorization; challenge: string; redirectUri: string }

export type OAuthFake = {
  /** Queues the answer of the next authorization (either provider). */
  next(authorization: FakeAuthorization): void
  /** How many token requests reached the fake. */
  tokenRequests(): number
  stop(): Promise<void>
}

/**
 * A Facebook `signed_request` for the data-deletion callback: `<signature>.<payload>`, both base64url, the signature
 * HMAC-SHA256 of the encoded payload with the app secret (the QA app's unless `secret` is given).
 */
export function facebookSignedRequest(userId: string, secret: string = QA_FACEBOOK_CLIENT_SECRET): string {
  const payload = Buffer.from(
    JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: userId, issued_at: Math.floor(Date.now() / 1000) }),
  ).toString('base64url')
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${signature}.${payload}`
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

const CLIENT_IDS: Record<FakeProvider, string> = { google: QA_GOOGLE_CLIENT_ID, facebook: QA_FACEBOOK_CLIENT_ID }

export async function startOAuthFake(port: number = fakePort()): Promise<OAuthFake> {
  const queue: FakeAuthorization[] = []
  const codes = new Map<string, IssuedCode>()
  const accessTokens = new Map<string, FakeAuthorization>()
  const hanging = new Set<http.ServerResponse>()
  let tokenCount = 0

  function authorize(provider: FakeProvider, url: URL, response: http.ServerResponse): void {
    const redirectUri = url.searchParams.get('redirect_uri') ?? ''
    const state = url.searchParams.get('state') ?? ''
    const back = new URL(redirectUri)
    back.searchParams.set('state', state)
    const authorization = queue.shift() ?? { behaviour: 'deny' }
    if (
      url.searchParams.get('client_id') !== CLIENT_IDS[provider] ||
      url.searchParams.get('code_challenge_method') !== 'S256' ||
      authorization.behaviour === 'deny'
    ) {
      back.searchParams.set('error', 'access_denied')
    } else {
      const code = randomBytes(16).toString('hex')
      codes.set(code, {
        provider,
        authorization,
        challenge: url.searchParams.get('code_challenge') ?? '',
        redirectUri,
      })
      back.searchParams.set('code', code)
    }
    response.writeHead(302, { location: back.toString() })
    response.end()
  }

  /** The code of a token request, once, when it was issued to `provider` for this redirect URI and verifier. */
  function redeem(provider: FakeProvider, form: URLSearchParams): IssuedCode | null {
    const issued = codes.get(form.get('code') ?? '')
    codes.delete(form.get('code') ?? '')
    const challenge = createHash('sha256')
      .update(form.get('code_verifier') ?? '')
      .digest('base64url')
    if (
      !issued ||
      issued.provider !== provider ||
      issued.redirectUri !== form.get('redirect_uri') ||
      issued.challenge !== challenge
    ) {
      return null
    }
    return issued
  }

  /** True when the token request may be answered; otherwise the hang or the 500 was already arranged. */
  function answers(authorization: FakeAuthorization, response: http.ServerResponse): boolean {
    if (authorization.behaviour === 'hang') {
      hanging.add(response)
      return false
    }
    if (authorization.behaviour === 'error') {
      json(response, 500, { error: 'server_error' })
      return false
    }
    return true
  }

  async function googleToken(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const form = new URLSearchParams(await readBody(request))
    const expectedAuth = `Basic ${Buffer.from(`${QA_GOOGLE_CLIENT_ID}:${QA_GOOGLE_CLIENT_SECRET}`).toString('base64')}`
    const issued = redeem('google', form)
    if (request.headers.authorization !== expectedAuth || !issued) {
      json(response, 400, { error: 'invalid_grant' })
      return
    }
    const { authorization } = issued
    if (!answers(authorization, response)) return
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
  }

  async function facebookToken(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const form = new URLSearchParams(await readBody(request))
    const issued = redeem('facebook', form)
    if (
      form.get('client_id') !== QA_FACEBOOK_CLIENT_ID ||
      form.get('client_secret') !== QA_FACEBOOK_CLIENT_SECRET ||
      form.get('grant_type') !== 'authorization_code' ||
      !issued
    ) {
      json(response, 400, { error: { message: 'Invalid verification code format.', type: 'OAuthException' } })
      return
    }
    if (!answers(issued.authorization, response)) return
    const accessToken = randomBytes(16).toString('hex')
    accessTokens.set(accessToken, issued.authorization)
    json(response, 200, { access_token: accessToken, token_type: 'bearer', expires_in: 5_183_944 })
  }

  function facebookMe(request: http.IncomingMessage, url: URL, response: http.ServerResponse): void {
    const accessToken = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1] ?? ''
    const authorization = accessTokens.get(accessToken)
    const proof = createHmac('sha256', QA_FACEBOOK_CLIENT_SECRET).update(accessToken).digest('hex')
    if (!authorization || url.searchParams.get('appsecret_proof') !== proof) {
      json(response, 400, { error: { message: 'Invalid OAuth access token.', type: 'OAuthException' } })
      return
    }
    if (authorization.behaviour === 'me_error') {
      json(response, 500, { error: { message: 'An unknown error occurred', type: 'OAuthException' } })
      return
    }
    const fields = new Set((url.searchParams.get('fields') ?? 'id').split(','))
    json(response, 200, {
      id: authorization.sub,
      ...(fields.has('email') && authorization.email ? { email: authorization.email } : {}),
    })
  }

  const server = http.createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${String(port)}`)
      const route = `${request.method ?? 'GET'} ${url.pathname}`
      if (route === 'GET /authorize') return authorize('google', url, response)
      if (route === 'GET /facebook/dialog/oauth') return authorize('facebook', url, response)
      if (route === 'GET /facebook/me') return facebookMe(request, url, response)
      if (route === 'POST /token' || route === 'POST /facebook/oauth/access_token') {
        tokenCount += 1
        return route === 'POST /token' ? googleToken(request, response) : facebookToken(request, response)
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
