import { useActorRef } from "@xstate/react";
import { ReactNode, createContext } from "react";
import { ActorRefFrom, assign, fromCallback, setup } from "xstate";
import { useTriggerSoundEffect, useRegisterPhoenixEvent } from "./helpers";

type WebinarState = "notStarted" | "live" | "ended";

interface WebinarStateWithMachineContext {
  time: number;
}

type WebinarStateWithMachineEvents =
  | { type: "tick" }
  | { type: "phoenix.webinarStarted" }
  | { type: "phoenix.webinarEnded" };

interface WebinarStateInput {
  initialWebinarState: WebinarState;
  initialWebinarTime: number;
}

const webinarStateMachine = setup({
  types: {} as {
    context: WebinarStateWithMachineContext;
    events: WebinarStateWithMachineEvents;
    input: WebinarStateInput;
  },
  actors: {
    webinarTimer: fromCallback(({ sendBack }) => {
      const webinarTimerInterval = setInterval(() => {
        sendBack({ type: "tick" });
      }, 1000);

      return () => {
        clearInterval(webinarTimerInterval);
      };
    }),
  },
  actions: {
    triggerSoundEffect: (_, _params: { soundEffect: string }) => {
      // Stub
    },
  },
  guards: {
    hasStarted: ({ event }) =>
      (event as unknown as { input: WebinarStateInput }).input
        .initialWebinarState === "live",
    hasEnded: ({ event }) =>
      (event as unknown as { input: WebinarStateInput }).input
        .initialWebinarState === "ended",
  },
}).createMachine({
  id: "Webinar state",
  context: ({ input }) => ({
    time: input.initialWebinarTime,
  }),
  initial: "init",
  states: {
    init: {
      always: [
        {
          guard: "hasEnded",
          target: "ended",
        },
        {
          guard: "hasStarted",
          target: "live",
        },
        {
          target: "notStarted",
        },
      ],
    },
    notStarted: {
      on: {
        "phoenix.webinarStarted": {
          actions: {
            type: "triggerSoundEffect",
            params: { soundEffect: "webinarStarted" },
          },
          target: "live",
        },
      },
    },
    live: {
      invoke: {
        id: "webinarTimer",
        src: "webinarTimer",
      },
      on: {
        tick: {
          actions: assign({
            time: ({ context }) => context.time + 1,
          }),
        },
        "phoenix.webinarEnded": {
          actions: {
            type: "triggerSoundEffect",
            params: { soundEffect: "webinarEnded" },
          },
          target: "ended",
        },
      },
    },
    ended: {},
  },
});

const WebinarStateContext = createContext(
  {} as ActorRefFrom<typeof webinarStateMachine>,
);

interface Props {
  initialWebinarState: WebinarState;
  initialWebinarTime: number;
  children: ReactNode;
}

export const WebinarStateContextProvider = ({
  children,
  initialWebinarState,
  initialWebinarTime,
}: Props) => {
  const triggerSoundEffect = useTriggerSoundEffect();

  const webinarStateActor = useActorRef(
    webinarStateMachine.provide({
      actions: {
        triggerSoundEffect: (_, { soundEffect }) => {
          triggerSoundEffect(soundEffect);
        },
      },
    }),
    {
      input: {
        initialWebinarTime,
        initialWebinarState,
      },
    },
  );

  useRegisterPhoenixEvent("webinarStarted", () => {
    webinarStateActor.send({ type: "phoenix.webinarStarted" });
  });

  useRegisterPhoenixEvent("webinarEnded", () => {
    webinarStateActor.send({ type: "phoenix.webinarEnded" });
  });

  return (
    <WebinarStateContext.Provider value={webinarStateActor}>
      {children}
    </WebinarStateContext.Provider>
  );
};
