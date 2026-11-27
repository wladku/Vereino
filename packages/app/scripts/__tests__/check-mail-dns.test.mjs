// Unit tests for the sending-domain DNS check (`yarn ops:mail-dns`, E28-S01, #821). Every DNS answer is stubbed.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULTS,
  addressDomain,
  checkDkim,
  checkDmarc,
  checkFrom,
  checkMailDns,
  checkMx,
  checkRelayCnames,
  checkSpf,
  fromAddresses,
  lookupCname,
  lookupMx,
  lookupTxt,
  main,
  organizationalDomain,
  parseArgs,
  parseDmarc,
} from '../../../../scripts/check-mail-dns.mjs'

const at = '@'
const DOMAIN = 'mail.example.org'
const FROM = `Vereino <noreply${at}${DOMAIN}>`
const KEY = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC1'

const notFound = (code = 'ENODATA') => Object.assign(new Error(code), { code })

// The records of a correctly set up domain; each test overrides the part it breaks.
function zone(overrides = {}) {
  return {
    txt: {
      [`resend._domainkey.${DOMAIN}`]: [[`p=${KEY.slice(0, 10)}`, KEY.slice(10)]],
      [`send.${DOMAIN}`]: [['v=spf1 include:amazonses.com ~all']],
      [`_dmarc.${DOMAIN}`]: [[`v=DMARC1; p=none; rua=mailto:dmarc-reports${at}example.org`]],
      ...overrides.txt,
    },
    mx: {
      [`send.${DOMAIN}`]: [{ exchange: 'feedback-smtp.eu-west-1.amazonses.com', priority: 10 }],
      ...overrides.mx,
    },
  }
}

// The current Resend setup: the Return-Path host and its sibling are CNAMEs; no TXT or MX of our own there.
function relayZone(overrides = {}) {
  const base = zone({ txt: { [`send.${DOMAIN}`]: undefined }, mx: { [`send.${DOMAIN}`]: undefined } })
  return {
    ...base,
    cname: {
      [`send.${DOMAIN}`]: ['send.forge.rmta.net'],
      [`rsend.${DOMAIN}`]: ['rsend-euw1.forge.rmta.net'],
      ...overrides.cname,
    },
  }
}

function resolverFor({ txt, mx, cname = {} }) {
  const lookups = []
  return {
    lookups,
    async resolveCname(name) {
      lookups.push(`CNAME ${name}`)
      if (cname[name] instanceof Error) throw cname[name]
      if (!cname[name]) throw notFound()
      return cname[name]
    },
    async resolveTxt(name) {
      lookups.push(`TXT ${name}`)
      if (txt[name] instanceof Error) throw txt[name]
      if (!txt[name]) throw notFound()
      return txt[name]
    },
    async resolveMx(name) {
      lookups.push(`MX ${name}`)
      if (mx[name] instanceof Error) throw mx[name]
      if (!mx[name]) throw notFound('ENOTFOUND')
      return mx[name]
    },
  }
}

async function run(args, records = zone(), env = {}) {
  const out = []
  const err = []
  const code = await main({
    args,
    env,
    resolver: resolverFor(records),
    log: (line) => out.push(line),
    logError: (line) => err.push(line),
  })
  return { code, out, err }
}

test('parseArgs reads the domain, the defaults and every option', () => {
  assert.deepEqual(parseArgs(['Mail.Example.org.']), { domain: DOMAIN, from: [], ...DEFAULTS, policy: undefined })
  assert.deepEqual(
    parseArgs([
      DOMAIN,
      '--from',
      'a',
      '--from',
      'b',
      '--return-path',
      'Bounce',
      '--dkim-selector',
      'sel',
      '--region',
      'eu-central-1',
      '--policy',
      'Quarantine',
    ]),
    {
      domain: DOMAIN,
      from: ['a', 'b'],
      returnPath: 'bounce',
      dkimSelector: 'sel',
      region: 'eu-central-1',
      policy: 'quarantine',
    },
  )
})

test('parseArgs refuses missing, unknown and malformed arguments', () => {
  assert.throws(() => parseArgs([]), /subdomain is missing/)
  assert.throws(() => parseArgs([DOMAIN, 'other.example.org']), /Unknown argument other/)
  assert.throws(() => parseArgs([DOMAIN, '--nope']), /Unknown argument --nope/)
  assert.throws(() => parseArgs([DOMAIN, '--from']), /--from needs a value/)
  assert.throws(() => parseArgs([DOMAIN, '--region', '--policy']), /--region needs a value/)
  assert.throws(() => parseArgs(['not a domain']), /is not a domain name/)
  assert.throws(() => parseArgs([DOMAIN, '--return-path', 'a.b']), /--return-path a\.b is not one DNS label/)
  assert.throws(() => parseArgs([DOMAIN, '--dkim-selector', '-x']), /--dkim-selector -x is not one DNS label/)
  assert.throws(() => parseArgs([DOMAIN, '--region', 'europe']), /--region europe is not a region/)
  assert.throws(() => parseArgs([DOMAIN, '--policy', 'strict']), /--policy must be one of none, quarantine, reject/)
})

test('fromAddresses prefers --from, else the two env variables that are set', () => {
  const env = { NOTIFICATIONS_EMAIL_FROM: ` ${FROM} `, EMAIL_FROM: '' }
  assert.deepEqual(fromAddresses({ from: ['x'] }, env), ['x'])
  assert.deepEqual(fromAddresses({ from: [] }, env), [FROM])
  assert.deepEqual(fromAddresses({ from: [] }, {}), [])
})

test('addressDomain reads bare and named addresses and rejects anything else', () => {
  assert.equal(addressDomain(FROM), DOMAIN)
  assert.equal(addressDomain(`noreply${at}Mail.Example.org.`), DOMAIN)
  assert.equal(addressDomain('noreply'), null)
  assert.equal(addressDomain(`${at}${DOMAIN}`), null)
  assert.equal(addressDomain(`noreply${at}`), null)
  assert.equal(addressDomain(`no reply${at}${DOMAIN}`), null)
})

test('organizationalDomain keeps the last two labels', () => {
  assert.equal(organizationalDomain(DOMAIN), 'example.org')
  assert.equal(organizationalDomain('example.org'), 'example.org')
})

test('lookupTxt and lookupMx turn "no record" into an empty list and pass other errors on', async () => {
  const resolver = resolverFor({ txt: { a: [['x', 'y']], b: notFound('ESERVFAIL') }, mx: { b: notFound('ETIMEOUT') } })
  assert.deepEqual(await lookupTxt(resolver, 'a'), ['xy'])
  assert.deepEqual(await lookupTxt(resolver, 'none'), [])
  assert.deepEqual(await lookupMx(resolver, 'none'), [])
  await assert.rejects(lookupTxt(resolver, 'b'), { code: 'ESERVFAIL' })
  await assert.rejects(lookupMx(resolver, 'b'), { code: 'ETIMEOUT' })
  await assert.rejects(
    lookupTxt(
      {
        resolveTxt: async () => {
          throw null
        },
      },
      'c',
    ),
    (error) => error === null,
  )
  await assert.rejects(
    lookupMx(
      {
        resolveMx: async () => {
          throw null
        },
      },
      'c',
    ),
    (error) => error === null,
  )
})

test('checkDkim wants a TXT record with a public key', () => {
  assert.deepEqual(checkDkim('k', [`p=${KEY}`]), [])
  assert.deepEqual(checkDkim('k', [`k=rsa; p=${KEY};`]), [])
  assert.match(checkDkim('k', [])[0], /no TXT record at k/)
  assert.match(checkDkim('k', ['p=', 'v=DKIM1; p=short'])[0], /holds no public key/)
})

test('checkSpf wants exactly one record that includes amazonses.com and ends in ~all or -all', () => {
  assert.deepEqual(checkSpf('s', ['v=spf1 include:amazonses.com ~all', 'other']), [])
  assert.deepEqual(checkSpf('s', ['v=spf1 include:amazonses.com -all']), [])
  assert.match(checkSpf('s', ['other'])[0], /no "v=spf1" TXT record at s/)
  assert.match(checkSpf('s', ['v=spf1 -all', 'v=spf1 ~all'])[0], /2 "v=spf1" records/)
  assert.deepEqual(checkSpf('s', ['v=spf1 include:example.org +all']), [
    'SPF: the record at s does not include amazonses.com.',
    'SPF: the record at s must end with ~all or -all.',
  ])
  assert.deepEqual(checkSpf('s', ['v=spf1']).length, 2)
})

test('checkMx wants the feedback host of the region', () => {
  const good = [{ exchange: 'FEEDBACK-SMTP.eu-west-1.amazonses.com.' }]
  assert.deepEqual(checkMx('s', good, 'eu-west-1'), [])
  assert.match(checkMx('s', [], 'eu-west-1')[0], /no MX record at s; add MX 10 feedback-smtp\.eu-west-1/)
  assert.match(
    checkMx('s', good, 'us-east-1')[0],
    /points at FEEDBACK-SMTP\.eu-west-1\.amazonses\.com\., expected feedback-smtp\.us-east-1/,
  )
})

test('parseDmarc reads tags and skips parts without a value', () => {
  assert.deepEqual(
    [...parseDmarc('v=DMARC1; P=none ;junk; =x')],
    [
      ['v', 'DMARC1'],
      ['p', 'none'],
    ],
  )
})

test('checkDmarc wants one record with a policy and a report address', () => {
  const rua = `rua=mailto:r${at}example.org`
  assert.deepEqual(checkDmarc('d', [`v=DMARC1; p=none; ${rua}`]), [])
  assert.deepEqual(checkDmarc('d', [`v=DMARC1; p=Quarantine; ${rua}`], 'quarantine'), [])
  assert.match(checkDmarc('d', ['other'])[0], /no "v=DMARC1" TXT record at d/)
  assert.match(checkDmarc('d', ['v=DMARC1; p=none', 'v=DMARC1'])[0], /2 "v=DMARC1" records/)
  assert.deepEqual(checkDmarc('d', ['v=DMARC1']), [
    'DMARC: the record at d has no valid p= (none, quarantine or reject).',
    'DMARC: the record at d has no rua=mailto: report address.',
  ])
  assert.deepEqual(checkDmarc('d', [`v=DMARC1; p=none; ${rua}`], 'quarantine'), [
    'DMARC: the record at d has p=none, expected p=quarantine.',
  ])
  assert.match(checkDmarc('d', ['v=DMARC1; p=reject; rua=https://x'])[0], /no rua=mailto/)
})

test('checkFrom wants every from-address on the verified domain', () => {
  assert.deepEqual(checkFrom(DOMAIN, [FROM]), [])
  assert.match(
    checkFrom(DOMAIN, [])[0],
    /no from-address to check; pass --from or set NOTIFICATIONS_EMAIL_FROM or EMAIL_FROM/,
  )
  assert.deepEqual(checkFrom(DOMAIN, ['nope', `x${at}example.org`]), [
    'From: "nope" is not an e-mail address.',
    `From: an address at example.org is outside the verified domain ${DOMAIN}.`,
  ])
})

test('checkMailDns falls back to the organizational DMARC record, and only when the subdomain has none', async () => {
  const records = zone({ txt: { [`_dmarc.${DOMAIN}`]: undefined, '_dmarc.example.org': [['v=DMARC1; p=reject']] } })
  const { problems } = await checkMailDns(parseArgs([DOMAIN, '--from', FROM]), { resolver: resolverFor(records), env: {} })
  assert.deepEqual(problems, ['DMARC: the record at _dmarc.example.org has no rua=mailto: report address.'])

  const none = zone({ txt: { [`_dmarc.${DOMAIN}`]: undefined } })
  assert.deepEqual((await checkMailDns(parseArgs([DOMAIN, '--from', FROM]), { resolver: resolverFor(none), env: {} })).problems, [
    `DMARC: no "v=DMARC1" TXT record at _dmarc.${DOMAIN}.`,
  ])

  const apex = resolverFor({ txt: {}, mx: {} })
  await checkMailDns(parseArgs(['example.org', '--from', `x${at}example.org`]), { resolver: apex, env: {} })
  assert.equal(apex.lookups.filter((lookup) => lookup.startsWith('TXT _dmarc')).length, 1)
})

test('lookupCname turns "no record" into an empty list and passes other errors on', async () => {
  assert.deepEqual(await lookupCname(resolverFor({ txt: {}, mx: {} }), 'x.example.org'), [])
  await assert.rejects(
    lookupCname(resolverFor({ txt: {}, mx: {}, cname: { 'x.example.org': notFound('ESERVFAIL') } }), 'x.example.org'),
    /ESERVFAIL/,
  )
})

test('checkRelayCnames wants both CNAMEs on hosts under rmta.net', () => {
  const ok = checkRelayCnames('send.d', ['send.forge.rmta.net.'], 'rsend.d', ['rsend-euw1.forge.rmta.net'])
  assert.deepEqual(ok, [])
  assert.deepEqual(checkRelayCnames('send.d', ['send.forge.rmta.net'], 'rsend.d', []), [
    'SPF: no CNAME at rsend.d; add the CNAME the provider shows (a host under rmta.net).',
  ])
  assert.deepEqual(checkRelayCnames('send.d', ['elsewhere.example.com'], 'rsend.d', ['rsend-euw1.forge.rmta.net']), [
    'SPF: the CNAME at send.d points at elsewhere.example.com, expected a host under rmta.net; copy the value the provider shows.',
  ])
  assert.deepEqual(checkRelayCnames('send.d', ['send.forge.rmta.net.vereino.org'], 'rsend.d', ['rsend-euw1.forge.rmta.net']), [
    'SPF: the CNAME at send.d points at send.forge.rmta.net.vereino.org, expected a host under rmta.net; copy the value the provider shows and end it with a dot (send.forge.rmta.net.), or the DNS panel appends your domain.',
  ])
})

test('checkMailDns takes the CNAME setup when the Return-Path host is a CNAME, and asks for it when nothing is there', async () => {
  const relay = await checkMailDns(parseArgs([DOMAIN, '--from', FROM]), { resolver: resolverFor(relayZone()), env: {} })
  assert.deepEqual(relay, { setup: 'relay', problems: [] })

  const missingSibling = relayZone({ cname: { [`rsend.${DOMAIN}`]: undefined } })
  assert.deepEqual((await checkMailDns(parseArgs([DOMAIN, '--from', FROM]), { resolver: resolverFor(missingSibling), env: {} })).problems, [
    `SPF: no CNAME at rsend.${DOMAIN}; add the CNAME the provider shows (a host under rmta.net).`,
  ])

  const empty = zone({ txt: { [`send.${DOMAIN}`]: undefined }, mx: { [`send.${DOMAIN}`]: undefined } })
  const result = await checkMailDns(parseArgs([DOMAIN, '--from', FROM]), { resolver: resolverFor(empty), env: {} })
  assert.equal(result.setup, 'amazonses')
  assert.deepEqual(result.problems, [
    `SPF: nothing at send.${DOMAIN} (the custom Return-Path); add the records the provider shows: today two CNAMEs, send.${DOMAIN} and rsend.${DOMAIN}, to hosts under rmta.net.`,
  ])
})

test('main exits 0 and names the CNAME setup when it is right', async () => {
  const { code, out, err } = await run([DOMAIN, '--from', FROM], relayZone())
  assert.equal(code, 0)
  assert.deepEqual(err, [])
  assert.match(out[0], /DKIM, SPF \(Return-Path send and rsend, CNAME to the provider\), DMARC and the from-address are right/)
})

test('main exits 0 and says so when everything is right', async () => {
  const { code, out, err } = await run([DOMAIN], zone(), { NOTIFICATIONS_EMAIL_FROM: FROM })
  assert.equal(code, 0)
  assert.deepEqual(err, [])
  assert.match(
    out[0],
    /mail\.example\.org: DKIM, SPF \(Return-Path send\), MX \(eu-west-1\), DMARC and the from-address are right/,
  )
})

test('main names every problem and exits 1 (negative case: missing records, a from-address elsewhere)', async () => {
  const broken = zone({ txt: { [`resend._domainkey.${DOMAIN}`]: undefined }, mx: { [`send.${DOMAIN}`]: undefined } })
  const { code, out, err } = await run([DOMAIN, '--from', `x${at}example.org`], broken)
  assert.equal(code, 1)
  assert.deepEqual(out, [])
  assert.deepEqual(err, [
    `- DKIM: no TXT record at resend._domainkey.${DOMAIN}; add the DKIM record the provider shows.`,
    `- Return-Path: no MX record at send.${DOMAIN}; add MX 10 feedback-smtp.eu-west-1.amazonses.com.`,
    `- From: an address at example.org is outside the verified domain ${DOMAIN}.`,
    `3 problem(s) with ${DOMAIN}; see docs/ops/email.md.`,
  ])
})

test('main exits 2 on a usage error or a failed lookup', async () => {
  assert.deepEqual(await run([]), {
    code: 2,
    out: [],
    err: [
      `The sending subdomain is missing. ${'Usage: check-mail-dns.mjs <sending subdomain> [--from <address>]... [--return-path <label>] [--dkim-selector <selector>] [--region <region>] [--policy none|quarantine|reject]'}`,
    ],
  })
  const failing = zone({ txt: { [`_dmarc.${DOMAIN}`]: notFound('ESERVFAIL') } })
  assert.deepEqual((await run([DOMAIN, '--from', FROM], failing)).err, [
    'DNS lookup failed (ESERVFAIL); check the network and run again.',
  ])
  const odd = { txt: { [`_dmarc.${DOMAIN}`]: new Error('boom') }, mx: {} }
  assert.deepEqual((await run([DOMAIN], odd)).err, ['DNS lookup failed (boom); check the network and run again.'])
  const nothing = { txt: { [`_dmarc.${DOMAIN}`]: null }, mx: {} }
  const throwsNull = {
    ...resolverFor(nothing),
    resolveTxt: async () => {
      throw null
    },
  }
  const err = []
  assert.equal(
    await main({ args: [DOMAIN], env: {}, resolver: throwsNull, log: () => {}, logError: (line) => err.push(line) }),
    2,
  )
  assert.deepEqual(err, ['DNS lookup failed (undefined); check the network and run again.'])
})
