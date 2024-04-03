/* eslint-disable @typescript-eslint/no-explicit-any */
import { Draft, produce, enableMapSet } from "immer";
import {
  AssignArgs,
  EventObject,
  MachineContext,
  ParameterizedObject,
  ProvidedActor,
  assign as xstateAssign,
} from "xstate";

enableMapSet();

export interface ImmerAssigner<
  TContext extends MachineContext,
  TExpressionEvent extends EventObject,
  TParams extends ParameterizedObject["params"] | undefined,
  TEvent extends EventObject,
  TActor extends ProvidedActor,
> {
  (
    args: AssignArgs<Draft<TContext>, TExpressionEvent, TEvent, TActor>,
    params: TParams,
  ): void;
}

const iAssign = <
  TContext extends MachineContext,
  TExpressionEvent extends EventObject = EventObject,
  TParams extends ParameterizedObject["params"] | undefined =
    | ParameterizedObject["params"]
    | undefined,
  TEvent extends EventObject = EventObject,
  TActor extends ProvidedActor = ProvidedActor,
>(
  recipe: ImmerAssigner<TContext, TExpressionEvent, TParams, TEvent, TActor>,
) =>
  xstateAssign<TContext, TExpressionEvent, TParams, TEvent, TActor>(
    ({ context, ...rest }, params) =>
      produce(context, (draft) =>
        recipe(
          {
            context: draft,
            ...rest,
          } as any,
          params,
        ),
      ),
  );

export { iAssign };

export interface ImmerUpdateEvent<
  TType extends string = string,
  TInput = unknown,
> {
  type: TType;
  input: TInput;
}

export const createUpdater = <
  TContext extends MachineContext,
  TExpressionEvent extends ImmerUpdateEvent,
  TEvent extends EventObject,
  TActor extends ProvidedActor = ProvidedActor,
>(
  type: TExpressionEvent["type"],
  recipe: ImmerAssigner<
    TContext,
    TExpressionEvent,
    ParameterizedObject["params"] | undefined,
    TEvent,
    TActor
  >,
) => {
  const update = (input: TExpressionEvent["input"]): TExpressionEvent =>
    ({
      input,
      type,
    }) as TExpressionEvent;

  return {
    action: iAssign<
      TContext,
      TExpressionEvent,
      ParameterizedObject["params"] | undefined,
      TEvent,
      TActor
    >(recipe),
    type,
    update,
  };
};
