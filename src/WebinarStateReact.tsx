import { ReactNode, createContext, useEffect, useState } from "react";
import { useTriggerSoundEffect, useRegisterPhoenixEvent } from "./helpers";

type WebinarState = "notStarted" | "live" | "ended";

const WebinarStateContext = createContext({} as WebinarState);
const WebinarTimerContext = createContext({} as number);

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
  const [webinarState, setWebinarState] = useState(initialWebinarState);
  const [webinarTimer, setWebinarTimer] = useState(initialWebinarTime);

  const triggerSoundEffect = useTriggerSoundEffect();

  useRegisterPhoenixEvent("webinarStarted", () => {
    setWebinarState("live");
  });

  useRegisterPhoenixEvent("webinarEnded", () => {
    setWebinarState("ended");
  });

  useEffect(() => {
    if (webinarState === "live") {
      triggerSoundEffect("webinarStarted");
      const webinarTimerInterval = setInterval(() => {
        setWebinarTimer((prev) => prev + 1);
      }, 1000);

      return () => {
        clearInterval(webinarTimerInterval);
      };
    }

    if (webinarState === "ended") triggerSoundEffect("webinarEnded");
  }, [webinarState, triggerSoundEffect]);

  return (
    <WebinarTimerContext.Provider value={webinarTimer}>
      <WebinarStateContext.Provider value={webinarState}>
        {children}
      </WebinarStateContext.Provider>
    </WebinarTimerContext.Provider>
  );
};
