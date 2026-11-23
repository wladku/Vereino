// Many clubs spec phase 3 (TEST-M02, TEST-M03; #631): a second app process on the same build and database as the test
// run, started with `VEREINO_CLUB_DOMAIN=localhost:<port>`, so club addresses `<slug>.localhost:<port>` (Chromium
// resolves every `*.localhost` to the loopback address) reach it without DNS. The shared app keeps its one-club
// behaviour for every other test. Only `next start`: no workers and no scheduler, a private local queue directory.
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { APP_ROOT } from './club'

export type ClubDomainApp = {
  port: number
  /** `localhost:<port>`, the club domain of this process. */
  domain: string
  /** `http://127.0.0.1:<port>`, the process's `APP_URL` (the instance's own address). */
  appUrl: string
  /** `http://localhost:<port>`, the bare club domain. */
  bareUrl: string
  /** `http://<slug>.localhost:<port>`, a club's address. */
  clubUrl(slug: string): string
  stop(): Promise<void>
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => {
        resolve(port)
      })
    })
  })
}

async function waitForReady(url: string, child: ChildProcess, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`[internal] the club-domain app exited with ${String(child.exitCode)}`)
    try {
      const response = await fetch(`${url}/login`, { redirect: 'manual' })
      if (response.status === 200) return
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error(`[internal] the club-domain app was not ready within ${String(timeoutMs / 1000)}s`)
}

function stopTree(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.pid === undefined) return Promise.resolve()
  const exited = new Promise<void>((resolve) =>
    child.once('exit', () => {
      resolve()
    }),
  )
  try {
    if (process.platform === 'win32') child.kill()
    else process.kill(-child.pid, 'SIGTERM')
  } catch {
    return Promise.resolve()
  }
  return Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 10_000))])
}

/** Starts the second app process and waits until its sign-in page answers. */
export async function startClubDomainApp(): Promise<ClubDomainApp> {
  const port = await freePort()
  const domain = `localhost:${String(port)}`
  const appUrl = `http://127.0.0.1:${String(port)}`
  const queueDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-club-domain-queue-'))
  // The app workspace keeps its own `node_modules` (`nmHoistingLimits: workspaces`).
  const nextBin = path.join(APP_ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')
  const child = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      APP_URL: appUrl,
      NEXT_PUBLIC_APP_URL: appUrl,
      BASE_URL: appUrl,
      VEREINO_CLUB_DOMAIN: domain,
      QUEUE_BASE_DIR: queueDir,
      AUTO_SPAWN_WORKERS: 'false',
      AUTO_SPAWN_SCHEDULER: 'false',
    },
    stdio: 'ignore',
    detached: process.platform !== 'win32',
  })
  try {
    await waitForReady(appUrl, child, 180_000)
  } catch (error) {
    await stopTree(child)
    fs.rmSync(queueDir, { recursive: true, force: true })
    throw error
  }
  return {
    port,
    domain,
    appUrl,
    bareUrl: `http://${domain}`,
    clubUrl: (slug) => `http://${slug}.${domain}`,
    stop: async () => {
      await stopTree(child)
      fs.rmSync(queueDir, { recursive: true, force: true })
    },
  }
}
