// Follows CONTRIBUTING.md's setup on this machine, command by command, as a new contributor would: the first
// bash block under "## Setup". `git clone` and `cd` are skipped (this is the clone); `bun run dev` is started,
// checked to serve the playground, and stopped. CI runs it on a clean runner (documentation-site spec: "New
// contributor setup").
//   bun scripts/contributor-setup.ts [--skip <command>…]   e.g. --skip "bun run test" when CI ran it already
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

/** The setup commands, comments and the clone left out. */
export function setupCommands(guide: string): string[] {
  const section = guide.split(/^## /m).find(s => s.startsWith('Setup\n')) ?? ''
  const block = /```bash\n([\s\S]*?)```/.exec(section)?.[1] ?? ''
  return block.split('\n').map(line => line.replace(/\s+#.*$/, '').trim()).filter(line => line && !/^(?:git clone|cd)\b/.test(line))
}

async function serves(url: string, seconds: number): Promise<boolean> {
  for (let i = 0; i < seconds; i++) {
    // any answer from the server (an empty playground's home page is a 404)
    if (await fetch(url).then(r => r.status < 500, () => false))
      return true
    await Bun.sleep(1000)
  }
  return false
}

if (import.meta.main) {
  const skip = process.argv.slice(2).flatMap((arg, i, all) => all[i - 1] === '--skip' ? [arg] : [])
  for (const command of setupCommands(readFileSync(`${root}CONTRIBUTING.md`, 'utf8'))) {
    if (skip.includes(command)) {
      console.log(`- ${command} (skipped)`)
      continue
    }
    console.log(`$ ${command}`)
    if (command === 'bun run dev') {
      // its own process group, so stopping it stops the Nuxt server it starts too
      const dev = Bun.spawn(['bun', 'run', 'dev'], { cwd: root, stdout: 'inherit', stderr: 'inherit', detached: true })
      const ok = await serves('http://localhost:3000/', 180)
      process.kill(-dev.pid, 'SIGTERM')
      if (!ok)
        throw new Error('`bun run dev` didn\'t serve the playground at http://localhost:3000 within 3 minutes')
      continue
    }
    const run = Bun.spawnSync(['bash', '-c', command], { cwd: root, stdout: 'inherit', stderr: 'inherit' })
    if (run.exitCode)
      throw new Error(`\`${command}\` failed (exit ${run.exitCode})`)
  }
  console.log('The contributor setup works as CONTRIBUTING.md describes it.')
}
