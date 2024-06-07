import { setup, enqueueActions, ActorRefFrom, stopChild, assign, AnyActorRef, EventObject } from 'xstate5'
import { assertExists } from '@shared/helpers/typeGuards'
import { produce } from 'immer'
import { LazyActorConfig, LazyActorInput } from './actorManagerConfig'
import { log } from './log'
import { LazyActorLoaderOutput, lazyActorLoader } from './lazyActorLoaderMachine'
import { sharedGuards } from './sharedSetup'

type ActorLoadingStatus = 'loading' | 'running' | 'error'

interface LazyActorManagerContext {
  actorStatusMap: Record<string, ActorLoadingStatus>
  lazyActorConfig: LazyActorConfig
}

type LazyActorManagerEvents =
  | { type: 'xstate.done.actor.import.*'; output: LazyActorLoaderOutput }
  | { type: 'xstate.error.actor.import.*'; id: string }
  // event input is merged with the output of the actor config input function
  | { type: 'actor.start'; id: string; input?: LazyActorInput }
  | { type: 'actor.stop'; id: string }
  | { type: 'CONFIG_FOR_LOADING_STRATEGY'; config: unknown }

/**
 * Machine for managing the actors to be spawned lazily
 * When an actor is told to start, a lazyActorLoaderMachine is spawned with the same system id
 * This actor:
 * - Lazily loads the actor logic from the given path
 * - Optionally loads additional data from an arbitary promise
 * - Collects events sent to this system id
 * - Collects event listeners on this system id
 * After loading, the actor from the js is spawned with the same system id with the loader data as input
 * Additional input passed to the import actor is also forwarded along the spawned actor's as input
 * The collected events sent to the import actor are sent to the spawned actor as well as any event listeners
 */
export const lazyActorManagerMachine = setup({
  types: {
    context: {} as LazyActorManagerContext,
    events: {} as LazyActorManagerEvents,
    input: {} as {
      lazyActorConfig: LazyActorConfig
    },
  },
  actors: {
    lazyActorLoader,
  },
  actions: {
    updateActorStatus: assign({
      actorStatusMap: ({ context }, { status, id }: { id: string; status: ActorLoadingStatus | 'delete' }) =>
        produce(context.actorStatusMap, (actorStatusMap) => {
          if (status === 'delete') delete actorStatusMap[id]
          else actorStatusMap[id] = status
        }),
    }),
  },
  guards: {
    ...sharedGuards,
    actorDoesNotExist: ({ context }, { id }: { id: string }) => !context.lazyActorConfig[id],
    actorAlreadyStarted: ({ context }, { id }: { id: string }) => Object.keys(context.actorStatusMap).includes(id),
  },
}).createMachine({
  id: 'actorManager',
  context: ({ input }) => ({
    lazyActorConfig: input.lazyActorConfig,
    actorStatusMap: {},
  }),
  // Start all actors whose loading strategy is eager
  entry: enqueueActions(({ context, enqueue }) => {
    Object.entries(context.lazyActorConfig).forEach(([id, actorConfig]) => {
      const { loadingStrategy, input } = actorConfig
      if (loadingStrategy !== 'eager') return
      if (typeof input === 'function')
        throw new Error('Lazy actor config input cannot be a function when loading strategy is eager')
      enqueue.raise({ type: 'actor.start', id, input })
    })
  }),
  on: {
    'actor.start': [
      {
        guard: {
          type: 'actorDoesNotExist',
          params: ({ event }) => ({ id: event.id }),
        },
        actions: log(({ event }) => `Actor ${event.id} not in lazyActorConfig`),
      },
      {
        guard: {
          type: 'actorAlreadyStarted',
          params: ({ event }) => ({ id: event.id }),
        },
        actions: log(({ event }) => `Actor ${event.id} already started`),
      },
      {
        actions: [
          log(({ event }) => `Starting ${event.id} actor`),
          enqueueActions(({ context, enqueue, event }) => {
            const { path, loader } = assertExists(context.lazyActorConfig[event.id])
            const { id, input = {} } = event
            enqueue.spawnChild('lazyActorLoader', {
              input: {
                id,
                actorLogicPath: path,
                loader,
                actorInput: input,
              },
              id: `import.${id}`,
              systemId: id,
            })
          }),
          {
            type: 'updateActorStatus',
            params: ({ event }) => ({ id: event.id, status: 'loading' }),
          },
        ],
      },
    ],
    'actor.stop': {
      actions: [
        log(({ event }) => `Stopped ${event.id} actor`),
        stopChild(({ event }) => event.id),
        {
          type: 'updateActorStatus',
          params: ({ event }) => ({ id: event.id, status: 'delete' }),
        },
      ],
    },
    'xstate.done.actor.import.*': {
      actions: [
        enqueueActions(({ enqueue, event }) => {
          const id = event.type.split('.')[4]
          const { actorLogic, loaderData, actorInput } = event.output
          const input = typeof actorInput === 'function' ? actorInput(loaderData) : actorInput

          enqueue(log(`Started ${id} actor`))
          enqueue.stopChild(`import.${id}`)
          // IDEA: Figure out how to type this
          // @ts-expect-error need to figure out how to type this
          enqueue.spawnChild(actorLogic, {
            id,
            systemId: id,
            input,
          })
          enqueue({
            type: 'updateActorStatus',
            params: { id, status: 'running' },
          })
        }),
        // Forward events and event listeners to the spawned actor
        enqueueActions(({ enqueue, event, system }) => {
          const id = event.type.split('.')[4]
          const { eventQueue, eventListeners } = event.output
          const actor = system.get(id) as AnyActorRef

          eventListeners.forEach((callbacks, key) => {
            callbacks.forEach((callback) => actor.on(key, callback))
          })

          eventQueue.forEach((queuedEvent) => {
            enqueue.sendTo(actor, queuedEvent)
          })
        }),
      ],
    },
    'xstate.error.actor.*': {
      actions: [
        enqueueActions(({ enqueue, event, check }) => {
          const id = event.type.split('.')[3]
          const { error } = event as unknown as EventObject & { error: Error }
          if (check('isDebugMode')) console.error(error)
          enqueue(log(`${id} actor ${error.toString()}`, 'ACTORMANAGERERROR'))
          enqueue.stopChild(id)
          enqueue({
            type: 'updateActorStatus',
            params: { id, status: 'error' },
          })
        }),
      ],
    },
    'xstate.error.actor.import.*': {
      actions: enqueueActions(({ check, enqueue, event }) => {
        const id = event.type.split('.')[4]
        const { error } = event as unknown as EventObject & { error: Error }
        if (check('isDebugMode')) console.error(error)
        enqueue(log(`import ${id} actor ${error.toString()}`, 'ACTORMANAGERERROR'))
        enqueue.stopChild(`import.${id}`)
        enqueue({
          type: 'updateActorStatus',
          params: { id, status: 'error' },
        })
      }),
    },
  },
  initial: 'configNotLoaded',
  states: {
    configNotLoaded: {
      on: {
        // Start all actors whose loading strategy is function based on the passed config
        CONFIG_FOR_LOADING_STRATEGY: {
          actions: enqueueActions(({ context, enqueue, event }) => {
            Object.entries(context.lazyActorConfig).forEach(([id, actorConfig]) => {
              if (actorConfig.loadingStrategy !== 'fromConfig') return
              const { loadingCondition, input: actorConfigInput } = actorConfig
              if (!loadingCondition(event.config)) return
              const input = actorConfigInput?.(event.config)
              enqueue.raise({ type: 'actor.start', id, input })
            })
          }),
        },
      },
    },
    configLoaded: {},
  },
})

export type LazyActorManagerMachine = typeof lazyActorManagerMachine
export type LazyActorManagerActorRef = ActorRefFrom<LazyActorManagerMachine>
