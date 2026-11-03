import { describe, expect, it } from 'vitest'
import { destructiveChanges, unconfirmedChanges } from '../../packages/core/src/runtime/server/db/migrations'

describe('destructive change detection', () => {
  it.each([
    ['ALTER TABLE `atelier_c_notes` DROP COLUMN `summary`;', 'drop column atelier_c_notes.summary'], // sqlite, mysql
    ['ALTER TABLE "atelier_c_notes" DROP COLUMN "summary" CASCADE;', 'drop column atelier_c_notes.summary'], // postgres
    ['DROP TABLE "atelier_c_notes" CASCADE;', 'drop table atelier_c_notes'],
    ['ALTER TABLE `atelier_c_notes` RENAME COLUMN `title` TO `heading`;', 'rename column atelier_c_notes.title to heading'],
    ['ALTER TABLE "atelier_c_notes" RENAME TO "atelier_c_posts";', 'rename table atelier_c_notes to atelier_c_posts'],
    ['RENAME TABLE `atelier_c_notes` TO `atelier_c_posts`;', 'rename table atelier_c_notes to atelier_c_posts'], // mysql
  ])('finds %s', (statement, change) => {
    expect(destructiveChanges(statement)).toEqual([change])
  })

  it('ignores additions and SQLite\'s copy-and-swap table rebuild, which keeps the data', () => {
    expect(destructiveChanges(`ALTER TABLE \`atelier_c_notes\` ADD \`teaser\` text;
CREATE TABLE \`__new_atelier_c_notes\` (\`_id\` text PRIMARY KEY, \`title\` text NOT NULL);
INSERT INTO \`__new_atelier_c_notes\`(\`_id\`, \`title\`) SELECT \`_id\`, \`title\` FROM \`atelier_c_notes\`;
DROP TABLE \`atelier_c_notes\`;
ALTER TABLE \`__new_atelier_c_notes\` RENAME TO \`atelier_c_notes\`;`)).toEqual([])
  })

  it('accepts a change only with its confirmation line', () => {
    const drop = 'ALTER TABLE `atelier_c_notes` DROP COLUMN `summary`;'
    expect(unconfirmedChanges(drop)).toEqual(['drop column atelier_c_notes.summary'])
    expect(unconfirmedChanges(`-- atelier:confirm drop column atelier_c_notes.summary\n${drop}`)).toEqual([])
    expect(unconfirmedChanges(`-- atelier:confirm drop column atelier_c_notes.other\n${drop}`)).toEqual(['drop column atelier_c_notes.summary'])
  })
})
