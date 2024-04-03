const assertExists = <T>(value: T | null | undefined) => {
  if (value === null || typeof value === "undefined") throw new Error();
  return value as Exclude<T, null | undefined>;
};
import { setup, enqueueActions, ActorRefFrom, stopChild, assign } from "xstate";
import { produce } from "immer";
import { DeferredActorConfigMap } from "./systemConfig";
import { log } from "./log";
import {
  DeferredActorLoaderOutput,
  deferredActorLoader,
} from "./deferredActorLoaderMachine";

type ActorLoadingStatus = "loading" | "running" | "error";

interface DeferredActorManagerContext {
  actorStatusMap: Record<string, ActorLoadingStatus>;
  deferredActors: DeferredActorConfigMap;
}

type DeferredActorManagerEvents =
  | { type: "xstate.done.actor.import.*"; output: DeferredActorLoaderOutput }
  | { type: "xstate.error.actor.import.*"; id: string }
  | { type: "actor.start"; id: string }
  | { type: "actor.stop"; id: string };

/**
 *
 * Machine for holding the actors to be spawned lazily
 * When an actor is told to start, a deferredActor loader machine is spawned with the same system id
 * This actor:
 * - lazily loads the js
 * - loads additional data through a promise
 * - Collects events sent to this system id
 * After loading, the actor from the js is spawned with the same system id with the loader data as input
 * Also the collected events are sent to this new machine
 */
const deferredActorManagerMachine = setup({
  types: {
    context: {} as DeferredActorManagerContext,
    events: {} as DeferredActorManagerEvents,
    input: {} as {
      deferredActors: DeferredActorConfigMap;
    },
  },
  actors: {
    deferredActorLoader,
  },
  actions: {
    updateActorStatus: assign({
      actorStatusMap: (
        { context },
        { status, id }: { id: string; status: ActorLoadingStatus | "delete" },
      ) =>
        produce(context.actorStatusMap, (actorStatusMap) => {
          if (status === "delete") delete actorStatusMap[id];
          else actorStatusMap[id] = status;
        }),
    }),
  },
  guards: {
    actorDoesNotExist: ({ context }, { id }: { id: string }) =>
      !context.deferredActors[id],
    actorAlreadyStarted: ({ context }, { id }: { id: string }) =>
      Object.keys(context.actorStatusMap).includes(id),
  },
}).createMachine({
  id: "system",
  context: ({ input }) => ({
    deferredActors: input.deferredActors,
    runningServiceStatus: new Map(),
    actorStatusMap: {},
  }),
  entry: enqueueActions(({ enqueue, context }) => {
    // Loops through the actors to determine which ones should load
    Object.keys(context.deferredActors).forEach((id) => {
      if (context.deferredActors[id]?.initiallyStarted())
        enqueue.raise({ type: "actor.start", id });
    });
  }),
  on: {
    "actor.start": [
      {
        guard: {
          type: "actorDoesNotExist",
          params: ({ event }) => ({ id: event.id }),
        },
        actions: log(({ event }) => `Actor ${event.id} not in system`),
      },
      {
        guard: {
          type: "actorAlreadyStarted",
          params: ({ event }) => ({ id: event.id }),
        },
        actions: log(({ event }) => `Actor ${event.id} already started`),
      },
      {
        actions: [
          log(({ event }) => `Starting ${event.id} actor`),
          enqueueActions(({ context, enqueue, event }) => {
            const { path, loader, input } = assertExists(
              context.deferredActors[event.id],
            );
            enqueue.spawnChild("deferredActorLoader", {
              input: {
                actorLogicPath: path,
                loader,
                actorInput: input ?? {},
              },
              id: `import.${event.id}`,
              systemId: event.id,
            });
          }),
          {
            type: "updateActorStatus",
            params: ({ event }) => ({ id: event.id, status: "loading" }),
          },
        ],
      },
    ],
    "actor.stop": {
      actions: [
        log(({ event }) => `Stopped ${event.id} actor`),
        stopChild(({ event }) => event.id),
        {
          type: "updateActorStatus",
          params: ({ event }) => ({ id: event.id, status: "delete" }),
        },
      ],
    },
    "xstate.done.actor.import.*": {
      actions: [
        enqueueActions(({ enqueue, event }) => {
          const id = event.type.split(".")[4];
          const { actorLogic, loaderData, actorInput } = event.output;

          enqueue(log(`Started ${id} actor`));
          enqueue.stopChild(`import.${id}`);
          // IDEA: Figure out how to type this
          // @ts-expect-error need to figure out how to type this
          enqueue.spawnChild(actorLogic, {
            id,
            systemId: id,
            input: {
              loaderData,
              ...actorInput,
            },
          });
          enqueue({
            type: "updateActorStatus",
            params: { id, status: "running" },
          });
        }),
        // IDEA: Do we also need to forward the observers
        enqueueActions(({ enqueue, event, system }) => {
          const id = event.type.split(".")[4];
          const { eventQueue } = event.output;
          eventQueue.forEach((queuedEvent) => {
            enqueue.sendTo(system.get(id), queuedEvent);
          });
        }),
      ],
    },
    "xstate.error.actor.import.*": {
      actions: [
        log(({ event }) => `Error ${event.id} actor`),
        stopChild(({ event }) => `import${event.id}`),
        {
          type: "updateActorStatus",
          params: ({ event }) => ({ id: event.id, status: "error" }),
        },
      ],
    },
  },
});

export default deferredActorManagerMachine;

export type DeferredActorManager = typeof deferredActorManagerMachine;
export type DeferredActorManagerActorRef = ActorRefFrom<DeferredActorManager>;
