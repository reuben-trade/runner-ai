import json
import logging


import requests
from dotenv import load_dotenv
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
    llm,
    metrics,
)
from livekit.agents.pipeline import VoicePipelineAgent
from livekit.plugins import (
    cartesia,
    openai,
    deepgram,
    noise_cancellation,
    silero,
    turn_detector,
)

import os
import time
from typing import Annotated

phone_numbers = {
    "Reuben": "+61422946817", 
    "Ruslan": "+61410772135"
}

global global_ctx
global global_agent


class AssistantFnc(llm.FunctionContext):
    def __init__(self, participant=None):
        super().__init__()
        self.participant = participant
        self.room_data = None  # Store room data here for later access


load_dotenv(dotenv_path=".env.local")
logger = logging.getLogger("voice-agent")

# @rakkateichou:
# Yeah, so ummm if testing without docker-compose, set this to localhost
NEXTJS_SERVER_URL = os.getenv("NEXT_SERVER_URL", "http://dev-frontend:3000")

def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()

def create_room():
    """
    Calls the Next.js API to create a new room and get join URL.
    :param creator_name: (str, optional): Name of the creator for the room
    :return: dict: Room details including roomName and joinUrl
    """
    try:
        # Build the URL with optional creator name
        url = f"{NEXTJS_SERVER_URL}/api/create-room"
        print(f"Creating room with URL: {url}")

        # Make the API request
        response = requests.get(url, verify=False)
        response.raise_for_status()  # Raise an exception for HTTP errors

        # Parse the JSON response
        room_data = response.json()
        logger.info(f"Room created: {room_data['roomName']}")

        return room_data
    except requests.RequestException as e:
        logger.error(f"Failed to create room: {e}")
        raise


async def entrypoint(ctx: JobContext): # agent is being provided ctx -> remember the server auto dispatches the agent
    global global_ctx
    global global_agent

    global_ctx = ctx
    initial_ctx = llm.ChatContext().append(
        role="system",
        text=(
            "You are a voice assistant. Your interface with users will be voice. Your primary task is to facilitate initiating video calls with users."
            "You should use short and concise responses, and avoiding usage of unpronouncable punctuation. Your job is to provide advice to female runners on their injuries."
        ),
    )

    logger.info(f"connecting to room {ctx.room.name}")

    # ctx.connect() uses API credentials, gives agent access to all rooms on livekit server
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # Wait for the first participant to connect
    participant = await ctx.wait_for_participant()
    logger.info(f"starting voice assistant for participant {participant.identity}")

    # Create function context instance with participant
    fnc_ctx = AssistantFnc(participant=participant)

    # This project is configured to use Deepgram STT, OpenAI LLM and Cartesia TTS plugins
    # Other great providers exist like Cerebras, ElevenLabs, Groq, Play.ht, Rime, and more
    # Learn more and pick the best one for your app:
    # https://docs.livekit.io/agents/plugins
    agent = VoicePipelineAgent(
        vad=ctx.proc.userdata["vad"],
        stt=deepgram.STT(),
        llm=openai.LLM(model="gpt-4o-mini"),
        tts=cartesia.TTS(),
        # use LiveKit's transformer-based turn detector
        turn_detector=turn_detector.EOUModel(),
        # minimum delay for endpointing, used when turn detector believes the user is done with their turn
        min_endpointing_delay=0.5,
        # maximum delay for endpointing, used when turn detector does not believe the user is done with their turn
        max_endpointing_delay=5.0,
        # enable background voice & noise cancellation, powered by Krisp
        # included at no additional cost with LiveKit Cloud
        noise_cancellation=noise_cancellation.BVC(),
        chat_ctx=initial_ctx,
        fnc_ctx=fnc_ctx,  # Add the function context here
    )
    global_agent = agent

    usage_collector = metrics.UsageCollector()

    @agent.on("metrics_collected")
    def on_metrics_collected(agent_metrics: metrics.AgentMetrics):
        metrics.log_metrics(agent_metrics)
        usage_collector.collect(agent_metrics)

    agent.start(ctx.room, participant)

    greeting_message = (
        f"Hey, what was your name?"
    )
    # The agent should be polite and greet the user when it joins :)
    await agent.say(greeting_message, allow_interruptions=True)
    print(greeting_message)

if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
        ),
    )
