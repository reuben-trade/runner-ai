"use client";

import { useState, useEffect } from "react";
import { Room } from "livekit-client";

type VideoCallProps = {
  room: Room;
};

export const VideoCallRedirect: React.FC<VideoCallProps> = ({ room }) => {
  const [callInfo, setCallInfo] = useState<{
    isActive: boolean;
    joinUrl: string;
    shareUrl: string;
    roomName: string;
  } | null>(null);

  useEffect(() => {
    // Register RPC method to be called by the agent
    const handleStartVideoCall = async (params: any) => {
      console.log("Received request to start video call:", params);
      
      // Set call info state with data provided by the agent
      setCallInfo({
        isActive: true,
        joinUrl: params.join_url,
        shareUrl: params.share_url,
        roomName: params.room_name
      });
      
      // Return success to the agent as string (required by LiveKit RPC)
      return JSON.stringify({ success: true });
    };

    // Register the function with LiveKit's RPC system
    room.localParticipant.registerRpcMethod(
      "start_video_call",
      handleStartVideoCall
    );

    // No need to return cleanup function as registerRpcMethod doesn't return a cleanup handle
  }, [room]);

  // When call info changes and is active, redirect to the join URL
  useEffect(() => {
    if (callInfo?.isActive && callInfo.joinUrl) {
      // Open the join URL in a new window/tab
      window.open(callInfo.joinUrl, "_blank");
      
      // Reset the call info to prevent repeated redirects
      setCallInfo(prev => 
        prev ? { ...prev, isActive: false } : null
      );
    }
  }, [callInfo]);

  // No UI is rendered by this component - it just handles the redirection
  return null;
};
