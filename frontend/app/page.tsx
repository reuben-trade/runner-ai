"use client";
import { useRouter } from "next/navigation";
import { RpcError, RpcInvocationData } from 'livekit-client';

import { CloseIcon } from "@/components/CloseIcon";
import { NoAgentNotification } from "@/components/NoAgentNotification";
import {
  AgentState,
  BarVisualizer,
  DisconnectButton,
  RoomAudioRenderer,
  RoomContext,
  VoiceAssistantControlBar,
  useVoiceAssistant,
} from "@livekit/components-react";
import { useKrispNoiseFilter } from "@livekit/components-react/krisp";
import { AnimatePresence, motion } from "framer-motion";
import { Room, RoomEvent } from "livekit-client";
import React, {useCallback, useContext, useEffect, useState} from "react";
import type { ConnectionDetails } from "./api/connection-details/route";

export default function Page() {
  const [agentState, setAgentState] = useState<AgentState>("disconnected");

  const [room] = useState(new Room());

  const onConnectButtonClicked = useCallback(async () => {
    // Generate room connection details, including:
    //   - A random Room name
    //   - A random Participant name
    //   - An Access Token to permit the participant to join the room
    //   - The URL of the LiveKit server to connect to
    //
    // In real-world application, you would likely allow the user to specify their
    // own participant name, and possibly to choose from existing rooms to join.

    const url = new URL(
      process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? "/api/connection-details",
      window.location.origin
    );
    const response = await fetch(url.toString());
    const connectionDetailsData: ConnectionDetails = await response.json();

    await room.connect(connectionDetailsData.serverUrl, connectionDetailsData.participantToken);
  }, [room]);

  useEffect(() => {
    room.on(RoomEvent.MediaDevicesError, onDeviceFailure);

    return () => {
      room.off(RoomEvent.MediaDevicesError, onDeviceFailure);
    };
  }, [room]);

  return (
    <main data-lk-theme="default" className="h-full grid content-center bg-[var(--lk-bg)]">
      <RoomContext.Provider value={room}>
        <div className="lk-room-container grid grid-rows-[2fr_1fr] items-center">
          <SimpleVoiceAssistant onStateChange={setAgentState} />
          <ControlBar onConnectButtonClicked={onConnectButtonClicked} agentState={agentState} />
          <RoomAudioRenderer />
          <NoAgentNotification state={agentState} />
        </div>
      </RoomContext.Provider>
    </main>
  );
}

function SimpleVoiceAssistant(props: { onStateChange: (state: AgentState) => void }) {
  const { state, audioTrack } = useVoiceAssistant();
  const router = useRouter();
  const roomContext = useContext(RoomContext);

  useEffect(() => {
    props.onStateChange(state);
  }, [props, state]);

  useEffect(() => {
    // Check if roomContext exists before trying to access its properties
    if (!roomContext || !roomContext.localParticipant) {
      console.warn("Room context or local participant is not available");
      return;
    }

    // Now it's safe to use roomContext
    roomContext.localParticipant.registerRpcMethod(
      'navigateToRoom',
      async (data: RpcInvocationData) => {
        try {
          const payload = JSON.parse(data.payload);
          const { roomName, joinUrl, participantName } = payload;

          console.log("Received navigation request:", payload);

          // Navigate to the room page
          // TODO(@rakkateichou): make it a URL object
          router.push(`/rooms/${roomName}?participantName=${participantName}`);

          return JSON.stringify({ success: true, message: "Navigation initiated" });
        } catch (error) {
          console.error("RPC navigation error:", error);
          // Type-safe error handling
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new RpcError(500, `Error during navigation: ${errorMessage}`);
        }
      }
    );

    console.log("RPC method 'navigateToRoom' registered");

    // Clean up function
    return () => {
      // Also check before cleanup
      if (roomContext && roomContext.localParticipant) {
        roomContext.localParticipant.unregisterRpcMethod('navigateToRoom');
        console.log("RPC method 'navigateToRoom' unregistered");
      }
    };
  }, [roomContext, router]); // Add roomContext and router as dependencies

  return (
    <div className="h-[300px] max-w-[90vw] mx-auto">
      <BarVisualizer
        state={state}
        barCount={5}
        trackRef={audioTrack}
        className="agent-visualizer"
        options={{ minHeight: 24 }}
      />
    </div>
  );
}
function ControlBar(props: { onConnectButtonClicked: () => void; agentState: AgentState }) {
  /**
   * Use Krisp background noise reduction when available.
   * Note: This is only available on Scale plan, see {@link https://livekit.io/pricing | LiveKit Pricing} for more details.
   */
  const krisp = useKrispNoiseFilter();
  useEffect(() => {
    krisp.setNoiseFilterEnabled(true);
  }, []);

  return (
    <div className="relative h-[100px]">
      <AnimatePresence>
        {props.agentState === "disconnected" && (
          <motion.button
            initial={{ opacity: 0, top: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, top: "-10px" }}
            transition={{ duration: 1, ease: [0.09, 1.04, 0.245, 1.055] }}
            className="uppercase absolute left-1/2 -translate-x-1/2 px-4 py-2 bg-white text-black rounded-md"
            onClick={() => props.onConnectButtonClicked()}
          >
            Start a conversation
          </motion.button>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {props.agentState !== "disconnected" && props.agentState !== "connecting" && (
          <motion.div
            initial={{ opacity: 0, top: "10px" }}
            animate={{ opacity: 1, top: 0 }}
            exit={{ opacity: 0, top: "-10px" }}
            transition={{ duration: 0.4, ease: [0.09, 1.04, 0.245, 1.055] }}
            className="flex h-8 absolute left-1/2 -translate-x-1/2  justify-center"
          >
            <VoiceAssistantControlBar controls={{ leave: false }} />
            <DisconnectButton>
              <CloseIcon />
            </DisconnectButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function onDeviceFailure(error: Error) {
  console.error(error);
  alert(
    "Error acquiring camera or microphone permissions. Please make sure you grant the necessary permissions in your browser and reload the tab"
  );
}