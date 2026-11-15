// Comments on an entry or one of its blocks, in threads, for signed-in users who may read the type; writing
// one needs the `comment` permission. Comments aren't content: never published, not in revisions.
//   GET     /api/_atelier/comments/<type>/<id>              threads, with `orphaned` on those about a removed block
//   POST    /api/_atelier/comments/<type>/<id>              { body, block?, thread?, mentions? }
//   PATCH   /api/_atelier/comments/<type>/<id>/<comment>    { body?, mentions? } (its author), { resolved } (commenters)
//   DELETE  /api/_atelier/comments/<type>/<id>/<comment>    its author, or who may delete the entry; a thread goes whole
// `mentions` are user ids; they're notified, and so is the thread's author on a reply.
import type { AuthUser } from '../auth/adapter'
import type { Comment } from '../collab/store'
import { defineEventHandler } from 'nuxt/server'
import * as v from 'valibot'
import { notifyUser } from '../collab/notify'
import { blockIds } from '../collab/store'
import { publish } from '../collab/realtime'
import { countWrite, namesOf, segments } from '../content-access'
import { apiError, readValid } from '../errors'
import { assertMigrated, requireUser, useAtelierAuth, useAtelierCollab, useAtelierEntries, useAtelierPolicy, useAtelierSchema, useAtelierSite } from '../index'
import { readableType } from './collab'

const PREFIX = '/api/_atelier/comments/'
const Body = v.pipe(v.string('body: expected text'), v.trim(), v.nonEmpty('body: write something'), v.maxLength(10_000, 'body: at most 10000 characters'))
const Mentions = v.optional(v.pipe(v.array(v.string(), 'mentions: expected user ids'), v.maxLength(20, 'mentions: at most 20')), [])
const Create = v.object({ body: Body, block: v.optional(v.nullable(v.string('block: expected a block id'))), thread: v.optional(v.nullable(v.string('thread: expected a comment id'))), mentions: Mentions })
const Update = v.object({ body: v.optional(Body), mentions: v.optional(Mentions), resolved: v.optional(v.boolean('resolved: expected true or false')) })

export default defineEventHandler(async (event) => {
  await assertMigrated()
  const user = await requireUser(event)
  const method = event.req.method
  const [rawType, rawId, commentId, ...rest] = segments(event, PREFIX)
  if (rest.length)
    throw apiError(404, 'Not found')
  const { type, id, topic } = await readableType(useAtelierSite(event), user, rawType, rawId)
  const policy = await useAtelierPolicy()
  const who = { principal: user, policy, site: useAtelierSite(event) }
  const collab = await useAtelierCollab()
  const blocksNow = async () => {
    const schema = await useAtelierSchema()
    const entries = await useAtelierEntries(useAtelierSite(event))
    const entry = schema.singletons[type] ? await entries.getSingleton(type, { stage: 'draft' }) : await entries.get(type, id, { stage: 'draft' })
    return blockIds(entry?.data ?? {})
  }
  const mayComment = () => {
    if (!policy.can(user, 'comment', type))
      throw apiError(403, `Your role can't comment on "${type}"`)
  }
  /** Mentioned users who exist and may read the type. */
  const mentionable = async (ids: string[]) => {
    const users = (await useAtelierAuth()).users
    const found = await Promise.all([...new Set(ids)].map(mention => users.get(mention).catch(() => null)))
    return found.filter((u): u is AuthUser => !!u && policy.can(u, 'read', type)).map(u => u.id)
  }
  const changed = () => publish(topic, 'comments')

  if (!commentId && method === 'GET') {
    const [comments, blocks] = await Promise.all([collab.comments(type, id), blocksNow()])
    const names = await namesOf(comments.map(c => c.author))
    return comments.map(c => ({ ...c, authorName: names.get(c.author), orphaned: !!c.block && !blocks.has(c.block) }))
  }
  if (!commentId && method === 'POST') {
    mayComment()
    const input = await readValid(event, Create)
    const block = input.block ?? null
    let thread: Comment | null = null
    if (input.thread) {
      thread = await collab.comment(input.thread)
      if (!thread || thread.type !== type || thread.entry !== id || thread.thread)
        throw apiError(400, 'thread: no such thread on this entry')
    }
    else if (block && !(await blocksNow()).has(block)) {
      throw apiError(400, `block: no block "${block}" in this entry`)
    }
    await countWrite(event, who)
    const mentions = await mentionable(input.mentions)
    const comment = await collab.addComment({ type, entry: id, block: thread ? thread.block : block, thread: thread?.id ?? null, author: user.id, body: input.body, mentions })
    const data = { type, entry: id, by: user.id, comment: comment.id, thread: thread?.id ?? comment.id, excerpt: input.body.slice(0, 280) }
    for (const mentioned of mentions.filter(m => m !== user.id))
      await notifyUser(event, mentioned, 'mention', data)
    if (thread && thread.author !== user.id && !mentions.includes(thread.author))
      await notifyUser(event, thread.author, 'reply', data)
    changed()
    return comment
  }
  const comment = commentId ? await collab.comment(commentId) : null
  if (!comment || comment.type !== type || comment.entry !== id)
    throw apiError(404, 'No such comment')
  if (method === 'PATCH') {
    const input = await readValid(event, Update)
    if ((input.body !== undefined || input.mentions !== undefined) && comment.author !== user.id)
      throw apiError(403, 'Only its author can edit a comment')
    if (input.resolved !== undefined) {
      mayComment()
      if (comment.thread)
        throw apiError(400, 'resolved: resolve the thread, through its first comment')
    }
    await countWrite(event, who)
    if (input.body !== undefined || input.mentions !== undefined) {
      const mentions = input.mentions ? await mentionable(input.mentions) : comment.mentions
      await collab.editComment(comment.id, input.body ?? comment.body, mentions)
      const data = { type, entry: id, by: user.id, comment: comment.id, thread: comment.thread ?? comment.id, excerpt: (input.body ?? comment.body).slice(0, 280) }
      for (const mentioned of mentions.filter(m => m !== user.id && !comment.mentions.includes(m)))
        await notifyUser(event, mentioned, 'mention', data)
    }
    if (input.resolved !== undefined)
      await collab.resolve(comment.id, input.resolved ? user.id : null)
    changed()
    return await collab.comment(comment.id)
  }
  if (method === 'DELETE') {
    if (comment.author !== user.id && !policy.can(user, 'delete', type))
      throw apiError(403, 'Only its author can delete a comment')
    await countWrite(event, who)
    await collab.deleteComment(comment.id)
    changed()
    return { ok: true }
  }
  throw apiError(405, 'Method not allowed')
})
