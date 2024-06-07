/* eslint-disable etc/no-misused-generics */
import { fromPromise } from 'xstate5'

export const actionStub =
  <TParams = unknown>(opts?: { shouldThrow?: boolean }) =>
  (_: unknown, _params: TParams) => {
    const { shouldThrow = true } = opts ?? {}
    if (shouldThrow) throw new Error('Not implemented')
  }

export const actorStub = <TOutput = unknown, TInput = unknown>(opts?: { shouldThrow?: boolean }) => {
  const { shouldThrow = true } = opts ?? {}

  return fromPromise<TOutput, TInput>(async () => {
    if (shouldThrow) throw new Error('Not implemented')
    return Promise.resolve({} as TOutput)
  })
}
