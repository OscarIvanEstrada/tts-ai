import asyncio
from fastapi import FastAPI, WebSocket, Request, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import re
from starlette.websockets import WebSocketDisconnect
import os
import sys
import httpx
import base64
import wave
import io

# Import the necessary libraries for TTS
import torch
from TTS.api import TTS

# The following line is crucial to avoid the NotImplementedError
# on Windows, as it changes the event loop policy to allow
# the execution of asynchronous subprocesses.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Make sure the model is in the same path or accessible.
TEMP_DIR = Path("./tmp")
TEMP_DIR.mkdir(exist_ok=True)

# 🐸TTS Initialization
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Using device: {device}")

# Cache for TTS models to avoid re-loading
tts_models = {}

def get_tts(model_name: str):
    """
    Load a TTS model from cache or initialize it.
    """
    if model_name not in tts_models:
        print(f"Loading TTS model: {model_name}")
        try:
            tts_models[model_name] = TTS(model_name, progress_bar=False).to(device)
        except Exception as e:
            print(f"Error initializing the TTS model {model_name}: {e}")
            return None
    return tts_models[model_name]

# Pre-load the default model to have it ready at startup
DEFAULT_MODEL = "tts_models/en/ljspeech/fast_pitch"
get_tts(DEFAULT_MODEL)


def split_text(text: str, max_words=20, min_words=10):
    """
    Split the text into coherently complete chunks.
    The logic was improved to handle complex punctuation such as
    ellipses and line breaks.
    """
    # Normalize punctuation to avoid issues with the TTS model
    # Replace ellipses (two or more dots) with a dash
    normalized_text = re.sub(r'\s*\.{2,}', ' - ', text).replace('\n', ' ').strip()

    # Regular expression to split text by sentence endings.
    sentences = re.split(r'(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=[.!?])\s+(?=[A-Z])', normalized_text)

    chunks = []
    current_chunk_words = []

    for sentence in sentences:
        if not sentence.strip():
            continue

        sentence_words = sentence.split()

        if len(current_chunk_words) + len(sentence_words) <= max_words:
            current_chunk_words.extend(sentence_words)
        else:
            if len(current_chunk_words) >= min_words:
                chunks.append(" ".join(current_chunk_words))
                current_chunk_words = sentence_words
            else:
                current_chunk_words.extend(sentence_words)

    if current_chunk_words:
        chunks.append(" ".join(current_chunk_words))

    for chunk in chunks:
        yield chunk


# Synchronous function to run TTS
def run_tts(tts_model: TTS, chunk: str, output_file: Path):
    """
    Run the TTS model synchronously.
    """
    try:
        tts_model.tts_to_file(text=chunk, file_path=str(output_file))
        return {"success": True, "stderr": ""}
    except Exception as e:
        return {"success": False, "stderr": str(e)}

async def synthesize_google_tts_chunk(text_chunk: str, voice: str) -> bytes | None:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        # This error should be handled by the caller
        raise ValueError("GOOGLE_API_KEY environment variable not set.")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key={api_key}"
    
    payload = {
        "contents": [{"parts": [{"text": text_chunk}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "temperature": 1,
            "speech_config": {
                "voice_config": {
                    "prebuilt_voice_config": {
                        "voice_name": voice
                    }
                }
            }
        },
        "model": "gemini-2.5-flash-preview-tts"
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, timeout=60.0)
        response.raise_for_status()
    
    response_json = response.json()
    audio_data_base64 = response_json["candidates"][0]["content"]["parts"][0]["inlineData"]["data"]
    pcm_data = base64.b64decode(audio_data_base64)
    
    # Convert PCM to WAV in memory
    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, 'wb') as wf:
        wf.setnchannels(1)  # Mono
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(24000) # 24kHz
        wf.writeframes(pcm_data)
    
    return wav_buffer.getvalue()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    try:
        while True:
            payload = await websocket.receive_json()
            text = payload.get("text")
            engine = payload.get("engine", "coqui")

            if not text:
                await websocket.send_text("❌ Error: The received text is empty.")
                continue

            await websocket.send_text("🔊 Starting streaming synthesis...")

            if engine == "coqui":
                model_name = payload.get("speaker", DEFAULT_MODEL)
                tts_model = get_tts(model_name)
                if tts_model is None:
                    await websocket.send_text(f"❌ Error: The TTS model '{model_name}' could not be initialized.")
                    continue

                for f in TEMP_DIR.glob("chunk_*.wav"):
                    os.remove(f)

                for idx, chunk in enumerate(split_text(text)):
                    await websocket.send_text(f"▶ Generating chunk {idx+1}: {chunk}")
                    output_wav = TEMP_DIR / f"chunk_{idx}.wav"
                    result = await asyncio.to_thread(run_tts, tts_model, chunk, output_wav)
                    if not result["success"]:
                        await websocket.send_text(f"❌ Error generating audio: {result['stderr']}")
                        break

                    with open(output_wav, "rb") as f:
                        data = f.read()
                        await websocket.send_bytes(data)
                    os.remove(output_wav)
            
            elif engine == "google":
                voice = payload.get("voice", "Puck")
                try:
                    for idx, chunk in enumerate(split_text(text)):
                        await websocket.send_text(f"▶ Generating chunk {idx+1}: {chunk}")
                        wav_data = await synthesize_google_tts_chunk(chunk, voice)
                        if wav_data:
                            await websocket.send_bytes(wav_data)
                except ValueError as e:
                    await websocket.send_text(f"❌ Error: {e}")
                except httpx.HTTPStatusError as e:
                    await websocket.send_text(f"❌ Error calling Google TTS API: {e.response.text}")
                except (KeyError, IndexError) as e:
                    await websocket.send_text(f"❌ Invalid response from Google TTS API: {e}")

            await websocket.send_text("✅ All chunks sent.")

    except WebSocketDisconnect:
        print("WebSocket disconnected.")
    except Exception as e:
        print(f"Unexpected WebSocket error: {e}")
        await websocket.send_text(f"❌ A server error occurred: {e}")
    finally:
        await websocket.close()


# Route to the static files folder
static_dir = os.path.join(os.path.dirname(__file__), "frontend/dist")

# --- Serve the frontend as static files ---
# Now that the API routes are defined, we can mount
# the static files. This ensures they are only served
# when an API route does not match.
app.mount(
    "/",
    StaticFiles(directory=os.path.join(os.path.dirname(__file__), static_dir), html=True),
    name="static"
)

# Route for the root: automatically returns index.html
@app.get("/", include_in_schema=False)
async def root():
    return FileResponse(os.path.join(static_dir, "index.html"))

# Catch-all route for SPA (React, Vue, Angular) - handles other frontend routes
@app.get("/{catchall:path}", include_in_schema=False)
async def serve_spa(catchall: str):
    return FileResponse(os.path.join(static_dir, "index.html"))
