import torch
from TTS.api import TTS

# Get device
device = "cuda" if torch.cuda.is_available() else "cpu"

# List available 🐸TTS models
print(TTS().list_models())

# Init TTS
tts = TTS("tts_models/en/jenny/jenny").to(device)


# Run TTS
tts.tts_to_file(text="Hello, how are you?", file_path="output.wav",weights_only=True)