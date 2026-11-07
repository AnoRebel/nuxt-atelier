// `nuxt-atelier/adapter`: the content adapter contract, for implementing a content backend
export {
  BlockOperationError,
  blockOperations,
  CONTENT_ADAPTER_CONTRACT,
  defineContentAdapter,
} from './runtime/shared/adapter'
export type {
  AdapterCapabilities,
  AdapterContext,
  BlockLocation,
  BlockTypeDescriptor,
  ContentAdapter,
  ContentRef,
  DefinedContentAdapter,
  EditState,
  Permissions,
  RevisionSummary,
} from './runtime/shared/adapter'
export type { Field, Fields } from './runtime/shared/fields'
export type { BlockInstance } from './runtime/shared/infer'
