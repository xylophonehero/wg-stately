/* eslint-disable etc/no-misused-generics */
import { createHoc } from '@shared/helpers/hocUtils'
import { useSelector } from '@xstate5/react'
import { ComponentProps } from 'react'
import { ActorRefFrom, AnyActorRef, AnyActorLogic, InputFrom, createEmptyActor, SnapshotFrom } from 'xstate5'
import { replaceKeys } from '@shared/helpers/replaceKeys'
import type { LazyActorManagerActorRef } from './lazyActorManagerMachine'

export interface PathToActorLogic<TActor extends AnyActorLogic = AnyActorLogic> {
  (): Promise<{ default: TActor }>
}

export type LazyActorInput<TObj extends object = object, LoaderData = unknown> =
  | TObj
  | ((loaderData: LoaderData) => TObj)

/**
 * path: A promise that resolves to some actor logic
 * loader: An optional promise that resolves to some data that can be used to make input for the actor
 * loadingStrategy: The loading strategy for each actor
 * - undefined: The actor won't start loading. It can be manually loaded with `actor.start` event on the actor manager
 * - 'eager': Start loading the actor as soon as the lazyActorManager has started
 * - 'fromConfig': Possibly start loading the actor when the config has been loaded
 * loadingCondition: A function which determines if the actor should load from the given config
 * input: Input for the loaded actor logic. It can come in a few varieties
 * - Static: Just an object which matches the required input of the actor
 * - From loader data: Use the loader data to determine the input
 * - From config: Use the config to determine the input. Either static or another function that uses the loader data
 */
type LazyActorConfigOptions<Config = unknown, TActor extends AnyActorLogic = AnyActorLogic, LoaderData = unknown> = {
  path: PathToActorLogic<TActor>
  // IDEA: Also could be promiseLogic
  loader?: () => Promise<LoaderData>
} & (
  | {
      loadingStrategy: 'fromConfig'
      loadingCondition: (config: Config) => boolean
      input?: (config: Config) => LazyActorInput<InputFrom<NoInfer<TActor>>, NoInfer<LoaderData>>
    }
  | {
      loadingStrategy?: 'eager'
      input?: LazyActorInput<InputFrom<NoInfer<TActor>>, NoInfer<LoaderData>>
    }
)

export type LazyActorConfig<Config = unknown> = Record<string, LazyActorConfigOptions<Config>>

export const createLazyActor = <Config = unknown, TActor extends AnyActorLogic = AnyActorLogic, LoaderData = unknown>(
  opts: LazyActorConfigOptions<Config, TActor, LoaderData>,
) => opts

export type ActorDictionary<Dictionary extends LazyActorConfig> = {
  [key in keyof Dictionary]: Dictionary[key]['path'] extends () => Promise<{
    default: infer TActor
  }>
    ? TActor
    : never
}

type AnyActorDictionary = ActorDictionary<Record<string, LazyActorConfigOptions>>

export type ActorRefDictonary<Dictionary extends AnyActorDictionary> = {
  [key in keyof Dictionary]: ActorRefFrom<Dictionary[key]>
}

export type ActorRefProps<
  TActorDictionary extends AnyActorDictionary,
  TActorIds extends (keyof TActorDictionary & string)[],
> = {
  [key in TActorIds[number] as `${key}ActorRef`]: ActorRefFrom<TActorDictionary[key]>
}

export const createActorManagerHelpers = <Project extends string, TActorDictionary extends AnyActorDictionary>({
  getRootActor,
  project,
}: {
  getRootActor: () => AnyActorRef
  project: Project
}) => {
  const getProjectActorManager = () => getRootActor().system.get('actorManager') as LazyActorManagerActorRef

  const getProjectActor = <TActorId extends keyof TActorDictionary, FailIfNotExists extends boolean = true>(
    name: TActorId & string,
    opts?: { failIfNotExists: FailIfNotExists },
  ): FailIfNotExists extends true
    ? ActorRefFrom<TActorDictionary[TActorId]>
    : ActorRefFrom<TActorDictionary[TActorId]> | undefined => {
    const rootActor = getRootActor()
    const systemActor = rootActor.system.get(name)
    if (systemActor) return systemActor

    // If the machine has errored, then always return an empty actor so `send` doesn't throw an error
    const actorManager = getProjectActorManager()
    const hasActorErrored = actorManager.getSnapshot().context.actorStatusMap[name] === 'error'
    if (hasActorErrored)
      // HACK: Type casting this to make it easier to consume. Will lead to errors if we are checking snapshots
      return createEmptyActor() as ActorRefFrom<TActorDictionary[TActorId]>

    const { failIfNotExists } = opts ?? { failIfNotExists: true }
    // If it's not an error, then it is likely a coding error was made
    if (failIfNotExists)
      throw new Error(`System actor ${name} does not exist. You might need to call renderWhen${project}ActorsLoaded`)
    // We want to explicitly use undefined here as `useSelector` works with it
    // @ts-expect-error TS doesn't know we just escaped the happy path
    // eslint-disable-next-line no-undefined
    return undefined
  }

  /**
   * When an actor may not be there and you need to subscribe to it's state, this is the hook to use
   */
  const useProjectActor = <TActorId extends keyof TActorDictionary>(
    name: TActorId & string,
  ): ActorRefFrom<TActorDictionary[TActorId]> | undefined => {
    const actorManager = getProjectActorManager()
    return useSelector(actorManager, (state) => state.children[name] as ActorRefFrom<TActorDictionary[TActorId]>)
  }

  const renderWhenProjectActorsLoaded = <TActorIds extends MaybeArray<keyof TActorDictionary & string>>(
    actorNames: TActorIds,
    opts?: {
      asOptionalWrapper?: boolean
    },
  ) =>
    createHoc<ActorRefProps<TActorDictionary, Flat<[TActorIds]>>>((WrappedComponent) => {
      const RenderWhenActorStarted = (props: ComponentProps<typeof WrappedComponent>) => {
        const { asOptionalWrapper = false } = opts ?? {}
        const actorManager = getProjectActorManager()

        /**
         * If one actor is loading do not render component
         * If one actor has not started or errored return the children if they are in props and is an optional wrapper
         * If all loaded return the component with the injected actor refs
         */
        const actorLoadingStatus = useSelector(actorManager, (state) => {
          const { actorStatusMap } = state.context
          for (const actorName of [actorNames].flat()) {
            if (actorStatusMap[actorName] === 'loading') return 'loading'
            if (!actorStatusMap[actorName]) return 'notLoaded'
            if (actorStatusMap[actorName] === 'error') return 'notLoaded'
          }
          return 'loaded'
        })

        if (actorLoadingStatus === 'loading') return null
        if (actorLoadingStatus === 'notLoaded')
          if (asOptionalWrapper && 'children' in props) return <>{props.children}</>
          else return null

        const actorRefs = Object.fromEntries(
          [actorNames].flat().map((actorId) => [`${actorId}ActorRef`, getProjectActor(actorId)]),
        )

        return <WrappedComponent {...actorRefs} {...props} />
      }

      return RenderWhenActorStarted
    })

  /**
   * When an actor may not be there and you need to subscribe to it's state, this is the hook to use
   */
  const createProjectUseSelector =
    <TActorId extends keyof TActorDictionary, TValue>(
      name: TActorId & string,
      selector: (state: SnapshotFrom<TActorDictionary[TActorId]>) => TValue,
      initialValue: TValue,
    ) =>
    () => {
      const actor = getProjectActor(name, { failIfNotExists: false }) as AnyActorRef
      return useSelector(actor, (state) => {
        if (!state) return initialValue
        if (actor.id.startsWith('import.')) return initialValue
        return selector(state)
      })
    }

  return replaceKeys(
    {
      createProjectUseSelector,
      getProjectActor,
      getProjectActorManager,
      renderWhenProjectActorsLoaded,
      useProjectActor,
    },
    'Project',
    project,
  )
}
