// Enforces semantic commit messages: `type(scope)!: subject`.
// Git-generated merge/revert messages are allowed as-is.
const TYPES = ['feat', 'fix', 'docs', 'perf', 'refactor', 'test', 'chore', 'ci', 'build', 'revert']
const PATTERN = new RegExp(`^(?:${TYPES.join('|')})(?:\\([\\w./-]+\\))?!?: \\S`)
const GIT_GENERATED = /^(?:Merge|Revert|fixup!|squash!) /

export function isValidCommitMessage(message: string): boolean {
  const header = message.split('\n').find(line => line.trim() && !line.startsWith('#')) ?? ''
  return GIT_GENERATED.test(header) || PATTERN.test(header)
}

if (import.meta.main) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: check-commit-msg <commit-msg-file>')
    process.exit(2)
  }
  const message = await Bun.file(file).text()
  if (!isValidCommitMessage(message)) {
    console.error(`✖ Commit message must follow semantic commits: <type>(<scope>)?: <subject>
  Allowed types: ${TYPES.join(', ')}
  Example: feat(block-system): add layer overrides`)
    process.exit(1)
  }
}
