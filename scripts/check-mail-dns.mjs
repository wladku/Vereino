#!/usr/bin/env node
// Sending-domain DNS check (E28-S01, #821; D-036 point 6, engineering standards S12.1): club e-mail is sent through
// Resend from a `vereino.org` subdomain (`mail.vereino.org`), and it arrives only when SPF, DKIM and DMARC are right.
// This command reads the public DNS records of that subdomain and the from-addresses of the environment, names every
// missing or wrong record, and exits 1; with everything right it exits 0. Runbook: `docs/ops/email.md`.
//
// It reads no secret: only public DNS and the from-addresses (`--from`, else `NOTIFICATIONS_EMAIL_FROM` and
// `EMAIL_FROM` of the environment).
// Usage: node scripts/check-mail-dns.mjs <sending subdomain> [--from <address>]... [--return-path <label>]
//          [--dkim-selector <selector>] [--region <provider region>] [--policy none|quarantine|reject]
import { Resolver } from 'node:dns/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULTS = Object.freeze({
  returnPath: 'send',
  dkimSelector: 'resend',
  region: 'eu-west-1',
})

export const DMARC_POLICIES = ['none', 'quarantine', 'reject']
export const FROM_ENV_VARIABLES = ['NOTIFICATIONS_EMAIL_FROM', 'EMAIL_FROM']

const USAGE = 'Usage: check-mail-dns.mjs <sending subdomain> [--from <address>]... [--return-path <label>]'
  + ' [--dkim-selector <selector>] [--region <region>] [--policy none|quarantine|reject]'

const HOST_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const REGION_PATTERN = /^[a-z]{2}-[a-z]+-\d$/
// A public key of at least 20 base64 characters: an empty `p=` is a revoked key.
const DKIM_KEY_PATTERN = /(?:^|;)\s*p=([A-Za-z0-9+/=]{20,})\s*(?:;|$)/
// `+all` lets anyone send and `?all` asserts nothing; only `~all` and `-all` protect the domain.
const SPF_ALL_PATTERN = /\s[~-]all$/

const option = (name) => ({ '--from': 'from', '--return-path': 'returnPath', '--dkim-selector': 'dkimSelector', '--region': 'region', '--policy': 'policy' })[name]

export function parseArgs(args) {
  const parsed = { domain: undefined, from: [], ...DEFAULTS, policy: undefined }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const key = option(arg)
    if (key) {
      const value = args[index + 1]
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value. ${USAGE}`)
      if (key === 'from') parsed.from.push(value)
      else parsed[key] = value.toLowerCase()
      index += 1
    } else if (arg.startsWith('--') || parsed.domain !== undefined) {
      throw new Error(`Unknown argument ${arg}. ${USAGE}`)
    } else {
      parsed.domain = arg.toLowerCase().replace(/\.$/, '')
    }
  }
  if (parsed.domain === undefined) throw new Error(`The sending subdomain is missing. ${USAGE}`)
  if (!HOST_PATTERN.test(parsed.domain)) throw new Error(`${parsed.domain} is not a domain name. ${USAGE}`)
  if (!LABEL_PATTERN.test(parsed.returnPath)) throw new Error(`--return-path ${parsed.returnPath} is not one DNS label.`)
  if (!LABEL_PATTERN.test(parsed.dkimSelector)) throw new Error(`--dkim-selector ${parsed.dkimSelector} is not one DNS label.`)
  if (!REGION_PATTERN.test(parsed.region)) throw new Error(`--region ${parsed.region} is not a region such as eu-west-1.`)
  if (parsed.policy !== undefined && !DMARC_POLICIES.includes(parsed.policy)) {
    throw new Error(`--policy must be one of ${DMARC_POLICIES.join(', ')}.`)
  }
  return parsed
}

// `--from` wins; otherwise the from-addresses the app itself would use.
export function fromAddresses(parsed, env) {
  if (parsed.from.length > 0) return parsed.from
  return FROM_ENV_VARIABLES.map((name) => env[name]?.trim()).filter(Boolean)
}

// `Club via Vereino <club@mail.example.org>` and `club@mail.example.org` both give the address's domain.
export function addressDomain(value) {
  const match = /<([^<>]+)>\s*$/.exec(value)
  const address = (match ? match[1] : value).trim()
  const at = address.lastIndexOf('@')
  if (at <= 0 || at === address.length - 1 || /\s/.test(address)) return null
  return address.slice(at + 1).toLowerCase().replace(/\.$/, '')
}

// The organizational domain DMARC falls back to: the last two labels (`mail.vereino.org` → `vereino.org`). Enough
// for the `.org` and `.pl` domains this check is for; it knows no public-suffix list.
export function organizationalDomain(domain) {
  return domain.split('.').slice(-2).join('.')
}

const NOT_FOUND_CODES = new Set(['ENODATA', 'ENOTFOUND', 'NXDOMAIN'])

// TXT answers joined per record (a long DKIM key comes in several strings); no record is an empty list.
export async function lookupTxt(resolver, name) {
  try {
    return (await resolver.resolveTxt(name)).map((chunks) => chunks.join(''))
  } catch (error) {
    if (NOT_FOUND_CODES.has(error?.code)) return []
    throw error
  }
}

export async function lookupMx(resolver, name) {
  try {
    return await resolver.resolveMx(name)
  } catch (error) {
    if (NOT_FOUND_CODES.has(error?.code)) return []
    throw error
  }
}

export function checkDkim(name, records) {
  if (records.length === 0) return [`DKIM: no TXT record at ${name}; add the DKIM record the provider shows.`]
  if (!records.some((record) => DKIM_KEY_PATTERN.test(record))) {
    return [`DKIM: the TXT record at ${name} holds no public key (p=...); copy the value the provider shows.`]
  }
  return []
}

export function checkSpf(name, records) {
  const spf = records.filter((record) => /^v=spf1(?:\s|$)/i.test(record.trim()))
  if (spf.length === 0) return [`SPF: no "v=spf1" TXT record at ${name} (the custom Return-Path).`]
  if (spf.length > 1) return [`SPF: ${String(spf.length)} "v=spf1" records at ${name}; keep exactly one.`]
  const record = spf[0].trim().toLowerCase()
  const problems = []
  if (!/\sinclude:amazonses\.com(?:\s|$)/.test(record)) problems.push(`SPF: the record at ${name} does not include amazonses.com.`)
  if (!SPF_ALL_PATTERN.test(record)) problems.push(`SPF: the record at ${name} must end with ~all or -all.`)
  return problems
}

export function checkMx(name, records, region) {
  const expected = `feedback-smtp.${region}.amazonses.com`
  if (records.length === 0) return [`Return-Path: no MX record at ${name}; add MX 10 ${expected}.`]
  if (!records.some((record) => record.exchange.toLowerCase().replace(/\.$/, '') === expected)) {
    const found = records.map((record) => record.exchange).join(', ')
    return [`Return-Path: the MX record at ${name} points at ${found}, expected ${expected} (region ${region}).`]
  }
  return []
}

export function parseDmarc(record) {
  const tags = new Map()
  for (const part of record.split(';').map((item) => item.trim())) {
    const at = part.indexOf('=')
    if (at > 0) tags.set(part.slice(0, at).trim().toLowerCase(), part.slice(at + 1).trim())
  }
  return tags
}

export function checkDmarc(name, records, expectedPolicy) {
  const dmarc = records.filter((record) => /^v=DMARC1\s*(?:;|$)/i.test(record.trim()))
  if (dmarc.length === 0) return [`DMARC: no "v=DMARC1" TXT record at ${name}.`]
  if (dmarc.length > 1) return [`DMARC: ${String(dmarc.length)} "v=DMARC1" records at ${name}; keep exactly one.`]
  const tags = parseDmarc(dmarc[0])
  const policy = tags.get('p')?.toLowerCase()
  const problems = []
  if (!DMARC_POLICIES.includes(policy)) problems.push(`DMARC: the record at ${name} has no valid p= (none, quarantine or reject).`)
  else if (expectedPolicy !== undefined && policy !== expectedPolicy) {
    problems.push(`DMARC: the record at ${name} has p=${policy}, expected p=${expectedPolicy}.`)
  }
  if (!/^mailto:[^@\s]+@[^@\s]+/i.test(tags.get('rua') ?? '')) {
    problems.push(`DMARC: the record at ${name} has no rua=mailto: report address.`)
  }
  return problems
}

export function checkFrom(domain, addresses) {
  if (addresses.length === 0) {
    return [`From: no from-address to check; pass --from or set ${FROM_ENV_VARIABLES.join(' or ')}.`]
  }
  const problems = []
  for (const value of addresses) {
    const found = addressDomain(value)
    if (found === null) problems.push(`From: "${value}" is not an e-mail address.`)
    else if (found !== domain) problems.push(`From: an address at ${found} is outside the verified domain ${domain}.`)
  }
  return problems
}

// Every check runs, so one run lists every problem. DMARC is read at the subdomain, else at the organizational
// domain, as receivers do (RFC 7489 section 6.6.3).
export async function checkMailDns(parsed, { resolver, env }) {
  const { domain } = parsed
  const dkimName = `${parsed.dkimSelector}._domainkey.${domain}`
  const returnPathName = `${parsed.returnPath}.${domain}`
  let dmarcName = `_dmarc.${domain}`
  let dmarcRecords = await lookupTxt(resolver, dmarcName)
  const orgDomain = organizationalDomain(domain)
  if (dmarcRecords.length === 0 && orgDomain !== domain) {
    const orgRecords = await lookupTxt(resolver, `_dmarc.${orgDomain}`)
    if (orgRecords.length > 0) {
      dmarcName = `_dmarc.${orgDomain}`
      dmarcRecords = orgRecords
    }
  }
  return [
    ...checkDkim(dkimName, await lookupTxt(resolver, dkimName)),
    ...checkSpf(returnPathName, await lookupTxt(resolver, returnPathName)),
    ...checkMx(returnPathName, await lookupMx(resolver, returnPathName), parsed.region),
    ...checkDmarc(dmarcName, dmarcRecords, parsed.policy),
    ...checkFrom(domain, fromAddresses(parsed, env)),
  ]
}

export async function main({ args, env, resolver, log, logError }) {
  let parsed
  try {
    parsed = parseArgs(args)
  } catch (error) {
    logError(error.message)
    return 2
  }
  let problems
  try {
    problems = await checkMailDns(parsed, { resolver, env })
  } catch (error) {
    logError(`DNS lookup failed (${String(error?.code ?? error?.message)}); check the network and run again.`)
    return 2
  }
  if (problems.length > 0) {
    for (const problem of problems) logError(`- ${problem}`)
    logError(`${String(problems.length)} problem(s) with ${parsed.domain}; see docs/ops/email.md.`)
    return 1
  }
  log(`${parsed.domain}: DKIM, SPF (Return-Path ${parsed.returnPath}), MX (${parsed.region}), DMARC and the from-address are right.`)
  return 0
}

/* node:coverage ignore next 4 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main({ args: process.argv.slice(2), env: process.env, resolver: new Resolver(), log: console.log, logError: console.error })
    .then((code) => { process.exitCode = code })
}
