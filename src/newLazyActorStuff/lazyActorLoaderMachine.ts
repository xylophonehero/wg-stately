import { assertExists, isUndefined } from '@shared/helpers/typeGuards'
import { produce } from 'immer'
import { AnyActorLogic, fromPromise, EventObject, setup, assign, sendParent, enqueueActions } from 'xstate5'
import { LazyActorInput, PathToActorLogic } from './actorManagerConfig'

export const importActorFromPathPromise = fromPromise<AnyActorLogic, { actorLogicPath: PathToActorLogic }>(
  ({ input }) => input.actorLogicPath().then((res) => res.default),
)

type ActorEventListeners = Map<string, Set<() => void>>

export interface LazyActorLoaderOutput {
  actorLogic: AnyActorLogic
  loaderData: unknown
  eventQueue: EventObject[]
  actorInput: LazyActorInput
  eventListeners: ActorEventListeners
}

interface LazyActorLoaderContext {
  id: string
  actorLogicPath: PathToActorLogic
  actorLogic: AnyActorLogic | null
  loader?: () => Promise<unknown>
  loaderData: unknown | null
  // Event queue which collects events while the actor is loading
  eventQueue: EventObject[]
  // Forwards this object to the actor that will be spawned
  actorInput: LazyActorInput
}

/**
 * Used by the lazy actor manager machines to:
 * - Lazily loads actor logic (actorLogicPath)
 * - Optionally loads data from an arbitary promise in parallel (loader)
 * - Collects events sent to this system id
 */
export const lazyActorLoader = setup({
  types: {
    context: {} as LazyActorLoaderContext,
    input: {} as {
      id: string
      actorLogicPath: PathToActorLogic
      loader?: () => Promise<unknown>
      actorInput: LazyActorInput
    },
    output: {} as LazyActorLoaderOutput,
  },
  actors: {
    importPathPromise: importActorFromPathPromise,
    dataLoaderPromise: fromPromise<unknown, { promise: () => Promise<unknown> }>(({ input }) => input.promise()),
  },
}).createMachine({
  context: ({ input }) => ({
    id: input.id,
    actorLogicPath: input.actorLogicPath,
    loader: input.loader,
    actorLogic: null,
    loaderData: null,
    eventQueue: [],
    actorInput: input.actorInput,
  }),
  on: {
    '*': {
      actions: enqueueActions(({ enqueue, context, event }) => {
        if (event.type.startsWith('xstate')) return
        enqueue.assign({
          eventQueue: produce(context.eventQueue, (eventQueue) => {
            eventQueue.push(event)
          }),
        })
      }),
    },
  },
  initial: 'loading',
  states: {
    loading: {
      type: 'parallel',
      states: {
        loadingActor: {
          initial: 'loading',
          states: {
            loading: {
              invoke: {
                src: 'importPathPromise',
                input: ({ context }) => ({
                  actorLogicPath: context.actorLogicPath,
                }),
                onDone: {
                  actions: assign({
                    actorLogic: ({ event }) => event.output,
                  }),
                  target: 'done',
                },
                onError: {
                  actions: sendParent(({ context, event }) => ({
                    type: `xstate.error.actor.import.${context.id}`,
                    error: event.error,
                  })),
                  target: '#error',
                },
              },
            },
            done: {
              type: 'final',
            },
          },
        },
        loadingData: {
          initial: 'init',
          states: {
            init: {
              always: [
                {
                  // Skipping if no loader is provided
                  guard: ({ context }) => isUndefined(context.loader),
                  target: 'done',
                },
                {
                  target: 'loading',
                },
              ],
            },
            loading: {
              invoke: {
                src: 'dataLoaderPromise',
                input: ({ context }) => ({
                  promise: assertExists(context.loader),
                }),
                onDone: {
                  actions: assign({
                    loaderData: ({ event }) => event.output,
                  }),
                  target: 'done',
                },
                onError: {
                  actions: sendParent(({ context, event }) => ({
                    type: `xstate.error.actor.import.${context.id}`,
                    error: event.error,
                  })),
                  target: '#error',
                },
              },
            },
            done: {
              type: 'final',
            },
          },
        },
      },
      onDone: {
        target: 'done',
      },
    },
    done: {
      type: 'final',
    },
    error: {
      id: 'error',
    },
  },
  output: ({ context, self }) => ({
    actorLogic: assertExists(context.actorLogic, `Actor Logic ${context.id} does not exist`),
    loaderData: context.loaderData,
    eventQueue: context.eventQueue,
    actorInput: context.actorInput,
    // @ts-expect-error these are there but don't exist on the types
    eventListeners: self.eventListeners as ActorEventListeners,
  }),
})
