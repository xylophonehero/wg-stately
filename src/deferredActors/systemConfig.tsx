type MaybeArray<T> = T | T[];
type Flat<T extends any[]> = T extends [infer U] ? U : T;
const createHoc = (hoc: any) => hoc;

import { useSelector } from "@xstate/react";
import { ComponentProps } from "react";
import { ActorRefFrom, AnyActorRef, AnyActorLogic, InputFrom } from "xstate";
import { DeferredActorManagerActorRef } from "./deferredActorManagerMachine";

export interface PathToActor<TActor extends AnyActorLogic = AnyActorLogic> {
  (): Promise<{ default: TActor }>;
}

interface DeferredActorConfig<TActor extends AnyActorLogic = AnyActorLogic> {
  initiallyStarted: () => boolean;
  path: PathToActor<TActor>;
  input?: Omit<InputFrom<NoInfer<TActor>>, "loaderData">;
  loader?: () => Promise<InputFrom<NoInfer<TActor>>["loaderData"]>;
}

export const createDeferredActor = <TActor extends AnyActorLogic>(
  config: DeferredActorConfig<TActor>,
) => config;

export type DeferredActorConfigMap = Record<string, DeferredActorConfig>;

export type ActorDictionary<Dictionary extends DeferredActorConfigMap> = {
  [key in keyof Dictionary]: Dictionary[key]["path"] extends () => Promise<{
    default: infer TActor;
  }>
    ? TActor
    : never;
};

type AnyActorDictionary = ActorDictionary<Record<string, DeferredActorConfig>>;

export type ActorRefDictonary<Dictionary extends AnyActorDictionary> = {
  [key in keyof Dictionary]: ActorRefFrom<Dictionary[key]>;
};

export const getSystemActor =
  <TActorDictionary extends AnyActorDictionary>(
    getRootActor: () => AnyActorRef,
  ) =>
  <TActorId extends keyof TActorDictionary>(
    name: TActorId,
    opts?: { failIfNotExists: boolean },
  ) => {
    const { failIfNotExists } = opts ?? { failIfNotExists: true };
    const rootActor = getRootActor();
    const systemActor = rootActor.system.get(name);
    if (!systemActor && failIfNotExists)
      throw new Error(`System actor ${name as string} does not exist`);

    return systemActor as ActorRefFrom<TActorDictionary[TActorId]>;
  };
export type ActorRefProps<
  TActorDictionary extends AnyActorDictionary,
  TActorIds extends (keyof TActorDictionary & string)[],
> = {
  [key in TActorIds[number] as `${key}ActorRef`]: ActorRefFrom<
    TActorDictionary[key]
  >;
};

export const renderWhenSystemActorsStarted =
  <TActorDictionary extends AnyActorDictionary>(
    getRootActor: () => AnyActorRef,
  ) =>
  <TActorIds extends MaybeArray<keyof TActorDictionary & string>>(
    actorNames: TActorIds,
  ) =>
    createHoc<ActorRefProps<TActorDictionary, Flat<[TActorIds]>>>(
      (WrappedComponent) => {
        const RenderWhenActorStarted = (
          props: ComponentProps<typeof WrappedComponent>,
        ) => {
          const systemActor = getSystemActor(getRootActor)(
            "system",
          ) as DeferredActorManagerActorRef;

          const hasLoaded = useSelector(systemActor, (state) =>
            [actorNames]
              .flat()
              .every(
                (actorName) =>
                  state.context.actorStatusMap[actorName as string] ===
                  "running",
              ),
          );
          const actorRefs = Object.fromEntries(
            [actorNames]
              .flat()
              .map((actorId) => [
                `${actorId}ActorRef`,
                getSystemActor(getRootActor)(actorId),
              ]),
          );

          if (hasLoaded) return <WrappedComponent {...actorRefs} {...props} />;
          return null;
        };
        return RenderWhenActorStarted;
      },
    );
