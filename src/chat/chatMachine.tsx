import { assign, fromPromise, setup } from "xstate";
import { useInView } from "react-intersection-observer";
import { log } from "../deferredActors/log";
import { useActor } from "@xstate/react";

const uniqueId = () => Math.floor(Math.random() * 1000000) * 1000;

const generateChatMessages = (initialId: number) => {
  return Array.from({ length: 50 }, (_, index) => ({
    id: index + initialId,
    message: `Hello world ${index + initialId}`,
  }));
};

type ChatMessage = {
  id: number;
  message: string;
};

export interface ChatMachineContext {
  chats: ChatMessage[];
}

export type ChatMachineEvent =
  | { type: "phoenix.newMessage"; payload: ChatMessage }
  | { type: "phoenix.removeMessage"; payload: { id: number } }
  | { type: "loadMoreChats" };

/**
 * The chatMachine is responsible for adding, paginating, etc. a list of chat messages.
 * This can be for either public chat, admin chat, or the messages within a conversation.
 */
const chatMachine = setup({
  types: {} as {
    context: ChatMachineContext;
    events: ChatMachineEvent;
  },
  actors: {
    getChatMessages: fromPromise<
      { chats: ChatMessage[] },
      { initialId: number }
    >(
      ({ input }) =>
        new Promise((res) => {
          setTimeout(() => {
            res({ chats: generateChatMessages(input.initialId) });
          }, 1000);
        }),
    ),
  },
}).createMachine({
  id: "chat",
  context: {
    chats: [],
  },
  initial: "loading",
  states: {
    loading: {
      id: "loading",
      invoke: {
        id: "getChatMessages",
        src: "getChatMessages",
        input: { initialId: 0 },
        onDone: [
          {
            target: "loaded",
            actions: assign({
              chats: ({ event }) => event.output.chats,
            }),
          },
        ],
        onError: {
          actions: [log("Failed to get chat messages")],
          target: "error",
        },
      },
    },
    loaded: {
      id: "loaded",
      on: {
        "phoenix.newMessage": [
          {
            actions: [
              log(({ event }) => `New message received:${event.payload.id}`),
              assign({
                chats: ({ context, event }) => [
                  event.payload,
                  ...context.chats,
                ],
              }),
            ],
          },
        ],
        "phoenix.removeMessage": {
          actions: [
            log(({ event }) => `Message removed:${event.payload.id}`),
            assign({
              chats: ({ context, event }) =>
                context.chats.filter(
                  (message) => message.id !== event.payload.id,
                ),
            }),
          ],
        },
      },
      initial: "idle",
      states: {
        idle: {
          on: {
            loadMoreChats: {
              target: "loadingMore",
            },
          },
        },
        loadingMore: {
          invoke: {
            id: "getChatMessages",
            src: "getChatMessages",
            input: ({ context }) => ({
              initialId: context.chats.at(-1)!.id + 1,
            }),
            onDone: [
              {
                target: "idle",
                actions: assign({
                  chats: ({ context, event }) => [
                    ...context.chats,
                    ...event.output.chats,
                  ],
                }),
              },
            ],
          },
        },
      },
    },
    error: {},
  },
});

const LoaderRow = ({ handleInView }: { handleInView: () => void }) => {
  const [ref] = useInView({
    initialInView: false,
    onChange: (isInView) => {
      if (isInView) handleInView();
    },
    rootMargin: "80px 0px",
  });
  return <div ref={ref}>Loading more...</div>;
};

export const ChatList = () => {
  const [state, send] = useActor(chatMachine);
  const { chats } = state.context;

  if (state.matches("loading")) return <div>Loading...</div>;
  if (state.matches("error")) return <div>There was an error</div>;

  return (
    <div>
      <div>
        <form
          onSubmit={(e) => {
            // NOTE: We would send this off to an external service and phoenix would respond with the websocket message
            // But we are just sending the phoenix events we would recieve here
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            send({
              type: "phoenix.newMessage",
              payload: {
                id: uniqueId(),
                message: formData.get("message") as string,
              },
            });
            e.currentTarget.reset();
          }}
        >
          <label htmlFor="message">Message</label>
          <input name="message" id="message" />
        </form>
      </div>

      <ul>
        {chats.map((chat) => (
          <li key={chat.id}>
            <span>{chat.message}</span>
            <button
              onClick={() =>
                // NOTE: We would send this off to an external service and phoenix would respond with the websocket message
                // But we are just sending the phoenix events we would recieve here
                send({
                  type: "phoenix.removeMessage",
                  payload: { id: chat.id },
                })
              }
            >
              Remove
            </button>
          </li>
        ))}
        <LoaderRow handleInView={() => send({ type: "loadMoreChats" })} />
      </ul>
    </div>
  );
};
