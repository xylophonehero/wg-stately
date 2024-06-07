import { ParameterizedObject, AnyActorRef, EventObject, EventFrom, InferEvent, Cast } from 'xstate5'
import { AnyActorSystem } from 'xstate5/dist/declarations/src/system'

// Utility to make a reusable sendTo action
// Since the sendTo action needs to inherit types from the machine it is used in setup,
// we can only reuse the args.
export const createSendToArgs = <
  TTargetActor extends AnyActorRef,
  TParams extends ParameterizedObject['params'] | undefined = undefined,
>(
  // Only system should be used here for it to be reusable in other actors
  to: (args: { system: AnyActorSystem }) => TTargetActor | string,
  eventOrExpr:
    | EventFrom<TTargetActor>
    | ((_: never, params: TParams) => InferEvent<Cast<EventFrom<TTargetActor>, EventObject>>),
) => [to, eventOrExpr] as const
