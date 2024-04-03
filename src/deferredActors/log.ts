/* eslint-disable @typescript-eslint/no-explicit-any */
type LoggingCategory = string;
// import { StreamingActorRefDictionary } from "@streaming/system/streamingActorConfig";
type StreamingActorRefDictionary = {
  chat: AnyActorRef;
  log: AnyActorRef;
};
import { AnyActorRef, enqueueActions, log as xstateLog } from "xstate";

/**
 * Intercepts the xstate log action and adds the systemId as the logging category
 * Does not accept extra params
 */
export const log: typeof xstateLog = (logExp) =>
  enqueueActions(({ enqueue, self, system }) => {
    const logActorRef = system.get("log") as StreamingActorRefDictionary["log"];
    return enqueue.sendTo(
      logActorRef,
      // HACK: not exactly the correct args passed to log function
      (args) => ({
        category: self.id as LoggingCategory,
        msg:
          typeof logExp === "function"
            ? (logExp(args, {} as any) as string)
            : logExp ?? "",
        type: "LOG",
      }),
    );
  });
