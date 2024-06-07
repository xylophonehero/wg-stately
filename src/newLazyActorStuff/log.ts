/* eslint-disable @typescript-eslint/no-explicit-any */
import { LogMachineActor } from '@streaming/logging/logMachine'
import { LoggingCategory } from '@streaming/logging/loggingCategory'
import { AnyActorRef, enqueueActions, log as xstateLog } from 'xstate5'

type AnyActorRefWithSystemId = AnyActorRef & { _systemId: string }

// Recursively get the systemId of the closest ancestor with a systemId
const getParentSystemId = (actorRef: AnyActorRef): string => {
  const parent = actorRef._parent as AnyActorRefWithSystemId | undefined
  if (!parent) throw new Error(`Could not get logging category for ${actorRef.id}`)
  if (parent._systemId) return parent._systemId
  return getParentSystemId(parent)
}

const getSystemId = (actorRef: AnyActorRef): string => {
  // HACK: _systemId is exposed for the internals but we want to use it to get the base actor systemId
  const systemId = (actorRef as AnyActorRefWithSystemId)._systemId
  if (systemId) return systemId
  return getParentSystemId(actorRef)
}

/**
 * Overrides the xstate log function
 * Does not accept extra params
 * The logging category will be the first part of the systemId or of the closest anscestor with a systemId
 */
export const log: typeof xstateLog = (logExp, overrideCategory) =>
  enqueueActions(({ enqueue, self, system }) => {
    const logActorRef = system.get('log') as LogMachineActor
    const systemId = getSystemId(self)
    const category = (overrideCategory ?? systemId.split('.')[0]) as LoggingCategory
    enqueue.sendTo(
      logActorRef,
      // HACK: not exactly the correct args passed to log function
      (args) => ({
        category,
        msg: typeof logExp === 'function' ? (logExp(args, {} as any) as string) : logExp ?? '',
        type: 'LOG',
      }),
    )
  })
