const assertExists = <T>(value: T | null | undefined) => {
  if (value === null || typeof value === "undefined") throw new Error();
  return value as Exclude<T, null | undefined>;
};
const isUndefined = <T>(value: T | undefined): value is undefined =>
  typeof value === "undefined";

import { produce } from "immer";
import { AnyActorLogic, fromPromise, EventObject, setup, assign } from "xstate";
import { PathToActor } from "./systemConfig";

export const importPathPromise = fromPromise<
  AnyActorLogic,
  { actorLogicPath: PathToActor }
>(({ input }) => input.actorLogicPath().then((res) => res.default));

export interface DeferredActorLoaderOutput {
  actorLogic: AnyActorLogic;
  loaderData: unknown;
  eventQueue: EventObject[];
  actorInput: object;
}

interface DeferredActorLoaderContext {
  actorLogicPath: PathToActor;
  actorLogic: AnyActorLogic | null;
  loader?: () => Promise<unknown>;
  loaderData: unknown | null;
  // Event queue which collects events while the actor is loading
  eventQueue: EventObject[];
  actorInput: object;
}

// IDEA: Escalate events when either of the loaders fail
export const deferredActorLoader = setup({
  types: {
    context: {} as DeferredActorLoaderContext,
    input: {} as {
      actorLogicPath: PathToActor;
      loader?: () => Promise<unknown>;
      actorInput: object;
    },
    output: {} as DeferredActorLoaderOutput,
  },
  actors: {
    importPathPromise,
    dataLoaderPromise: fromPromise<
      unknown,
      { promise: () => Promise<unknown> }
    >(({ input }) => input.promise()),
  },
}).createMachine({
  context: ({ input }) => ({
    actorLogicPath: input.actorLogicPath,
    loader: input.loader,
    actorLogic: null,
    loaderData: null,
    eventQueue: [],
    actorInput: input.actorInput,
  }),
  on: {
    "*": {
      actions: assign({
        eventQueue: ({ context, event }) =>
          produce(context.eventQueue, (draftEventQueue) => {
            draftEventQueue.push(event);
          }),
      }),
    },
  },
  initial: "loading",
  states: {
    loading: {
      type: "parallel",
      states: {
        loadingActor: {
          initial: "loading",
          states: {
            loading: {
              invoke: {
                src: "importPathPromise",
                input: ({ context }) => ({
                  actorLogicPath: context.actorLogicPath,
                }),
                onDone: {
                  actions: assign({
                    actorLogic: ({ event }) => event.output,
                  }),
                  target: "done",
                },
                onError: {
                  target: "#error",
                },
              },
            },
            done: {
              type: "final",
            },
          },
        },
        loadingData: {
          initial: "init",
          states: {
            init: {
              always: [
                {
                  guard: ({ context }) => isUndefined(context.loader),
                  target: "done",
                },
                {
                  target: "loading",
                },
              ],
            },
            loading: {
              invoke: {
                src: "dataLoaderPromise",
                input: ({ context }) => ({
                  promise: assertExists(context.loader),
                }),
                onDone: {
                  actions: assign({
                    loaderData: ({ event }) => event.output,
                  }),
                  target: "done",
                },
                onError: {
                  target: "#error",
                },
              },
            },
            done: {
              type: "final",
            },
          },
        },
      },
      onDone: {
        target: "done",
      },
    },
    done: {
      type: "final",
    },
    error: {
      id: "error",
      type: "final",
    },
  },
  output: ({ context }) => ({
    actorLogic: assertExists(context.actorLogic),
    loaderData: context.loaderData,
    eventQueue: context.eventQueue,
    actorInput: context.actorInput,
  }),
});
