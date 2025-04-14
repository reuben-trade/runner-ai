# LiveKit Architecture and Implementation Guide

This document explains how LiveKit works based on the provided code samples, focusing on room connections, participant management, and integrating AI agents with voice capabilities.

## System Overview

LiveKit is a real-time communication platform that facilitates audio/video interactions between participants in virtual "rooms". The architecture consists of:

1. **Frontend client** (React/Next.js): Handles UI and client-side room connections
2. **Backend services**: Manages room creation, authentication, and agent deployment
3. **Voice Agent**: AI-powered assistant that can participate in rooms
4. **SIP Integration**: Allows for bridging traditional telephony with LiveKit rooms

## Key Components and Their Interconnections

### 1. Authentication & Room Connection Flow

The system uses JWT-based authentication to secure room access:

```
Client → Backend API → Generate JWT Token → Client connects to LiveKit with token
```

In your code, this happens in:

1. **Frontend (`page.tsx`)** - Initiates connection:
   ```typescript
   const onConnectButtonClicked = useCallback(async () => {
     // Get connection details from API
     const response = await fetch(url.toString());
     const connectionDetailsData: ConnectionDetails = await response.json();
     
     // Connect to the room using the token and server URL
     await room.connect(connectionDetailsData.serverUrl, connectionDetailsData.participantToken);
   }, [room]);
   ```

2. **Backend (`route.ts`)** - Generates tokens:
   ```typescript
   // Generate participant token with identity and permissions
   const participantIdentity = `voice_assistant_user_${Math.floor(Math.random() * 10_000)}`;
   const roomName = `voice_assistant_room_${Math.floor(Math.random() * 10_000)}`;
   const participantToken = await createParticipantToken(
     { identity: participantIdentity },
     roomName
   );
   ```

### 2. Voice Agent Integration

The agent.py file shows how an AI voice agent connects to a room:

```python
async def entrypoint(ctx: JobContext):
    # System prompt for the AI agent
    initial_ctx = llm.ChatContext().append(
        role="system",
        text=(
            "You are a voice assistant created by LiveKit..."
        ),
    )

    # Connect to the room
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # Wait for participants
    participant = await ctx.wait_for_participant()
    
    # Initialize the voice pipeline with various components
    agent = VoicePipelineAgent(
        vad=ctx.proc.userdata["vad"],
        stt=deepgram.STT(),
        llm=openai.LLM(model="gpt-4o-mini"),
        tts=cartesia.TTS(),
        # Additional components
    )
    
    # Start the agent
    agent.start(ctx.room, participant)
    
    # Initial greeting
    await agent.say("Hey, how can I help you today?", allow_interruptions=True)
```

### 3. Room Lifecycle Management

From your code and notes, rooms follow this lifecycle:

1. **Creation**: Automatically when a participant joins with a new room name
2. **Active**: While participants are connected
3. **Termination**: Shortly after all participants leave

## Implementation Guide for Your Requirements

### 1. Creating Rooms and Inviting Participants

To create a system where an AI agent can create rooms and invite participants:

```python
async def create_and_invite(agent_context, participant_identities):
    # 1. Generate a unique room name
    room_name = f"ai_room_{uuid.uuid4()}"
    
    # 2. Create room using server API (if not using auto-creation)
    # room_info = await create_room_api_call(room_name)
    
    # 3. Generate tokens for each participant
    participant_tokens = {}
    for identity in participant_identities:
        token = generate_participant_token(identity, room_name)
        participant_tokens[identity] = token
    
    # 4. Connect the agent to the room
    await agent_context.connect(room_name, agent_token)
    
    # 5. Send invitations (via your app's notification system)
    await send_invitations(participant_tokens)
    
    return room_name, participant_tokens
```

### 2. Accepting Invitations to Join Rooms

For participants to accept invitations:

1. **Store invitation tokens** in your application database
2. **Provide UI** for users to see and accept invitations
3. **When accepted**, use the token to connect:

```javascript
// Frontend code
async function acceptInvitation(invitationId) {
    // 1. Fetch invitation details from your backend
    const invitation = await fetchInvitation(invitationId);
    
    // 2. Use the token to connect to the room
    const room = new Room();
    await room.connect(invitation.serverUrl, invitation.token);
    
    // 3. Mark invitation as accepted in your backend
    await markInvitationAccepted(invitationId);
}
```

### 3. Handling Mobile Calls Within Rooms

To enable AI agents to answer mobile calls within rooms, you need to integrate SIP trunking:

1. **Set up a SIP trunk** with a provider like Twilio
2. **Configure LiveKit SIP integration** to route calls to rooms
3. **Update your agent code** to handle incoming calls:

```python
# In your agent code
@agent.on("sip_call_received")
async def handle_incoming_call(call_info):
    # 1. Answer the call
    await agent.answer_call()
    
    # 2. Greet the caller
    await agent.say("Hello, this is your AI assistant. How can I help you today?")
    
    # 3. Process the conversation
    # This will be handled by your VoicePipelineAgent
```

## Key APIs and Integration Points

Based on your code:

1. **Room Connection**:
   - Client-side: `room.connect(serverUrl, token)`
   - Agent-side: `ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)`

2. **Token Generation**:
   ```typescript
   function createParticipantToken(userInfo: AccessTokenOptions, roomName: string) {
     const at = new AccessToken(API_KEY, API_SECRET, {
       ...userInfo,
       ttl: "15m",
     });
     const grant: VideoGrant = {
       room: roomName,
       roomJoin: true,
       canPublish: true,
       canPublishData: true,
       canSubscribe: true,
     };
     at.addGrant(grant);
     return at.toJwt();
   }
   ```

3. **Voice Pipeline Integration**:
   ```python
   agent = VoicePipelineAgent(
       vad=ctx.proc.userdata["vad"],
       stt=deepgram.STT(),
       llm=openai.LLM(model="gpt-4o-mini"),
       tts=cartesia.TTS(),
       # Additional components
   )
   ```

## Configuration Requirements

To implement this system, you'll need:

1. **LiveKit API Keys**: Store in environment variables
   ```
   LIVEKIT_API_KEY=your_api_key
   LIVEKIT_API_SECRET=your_api_secret
   LIVEKIT_URL=wss://your-livekit-instance.com
   ```

2. **SIP Integration** (for telephony):
   - SIP trunk provider credentials
   - SIP configuration in LiveKit

3. **AI Components**:
   - API keys for STT (Deepgram)
   - API keys for LLM (OpenAI)
   - API keys for TTS (Cartesia)

## Putting It All Together

1. **Backend Services**:
   - Room management API
   - Token generation API
   - Invitation system
   - SIP call routing

2. **AI Agent Worker**:
   - Running instances of agent.py
   - Integration with your AI services

3. **Frontend Client**:
   - Room UI (using LiveKit React components)
   - Invitation management
   - Call status indicators

This architecture allows for creating a system where AI agents can create rooms, invite participants, accept invitations to join rooms, and answer mobile calls within these rooms.
