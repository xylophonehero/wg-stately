/* eslint-disable @typescript-eslint/no-explicit-any */
import { getConfig, getEnvironment } from '@config/configStore'
import { registerEmbedEventActor } from '@config/embedEvent'
import { ProjectConfig } from '@config/types'
import { setInLocalStorage } from '@shared/helpers/localStorage'
import { clearIntervalWithId, setIntervalWithId } from '@shared/helpers/setInterval'
import { Environment } from '@shared/hooks/getEnvironment'
import { emitStreamingEventAction, registerStreamingEventActor } from '@streaming/events/types'
import { fromObservable } from 'xstate5'

export const interval = fromObservable<number, { interval: number }>(({ input, self }) => {
  const { id } = self
  return {
    subscribe: (observer) => {
      let count = 0
      const intervalRef = setIntervalWithId(
        () => {
          count += 1
          if (typeof observer === 'function') observer(count)
          else observer.next?.(count)
        },
        input.interval,
        id,
      )
      return {
        unsubscribe: () => {
          clearIntervalWithId(intervalRef, id)
        },
      }
    },
  }
})

export const sharedActors = {
  interval,
  registerEmbedEvent: registerEmbedEventActor,
  registerStreamingEvent: registerStreamingEventActor,
}

export const sharedActions = {
  emitStreamingEvent: emitStreamingEventAction,
  // Sets a value in local storage under a given key
  setInLocalStorage: (_: any, params: { key: string; value: unknown }) => setInLocalStorage(params.key, params.value),
}

export const sharedGuards = {
  isDebugMode: () => Boolean(getConfig().debug),
  isEnvironment: (_: any, { environment }: { environment: MaybeArray<Environment> }) =>
    [environment].flat().includes(getEnvironment()),
  isProject: (_: any, { project }: { project: MaybeArray<ProjectConfig> }) =>
    [project].flat().includes(getConfig().project),
}
