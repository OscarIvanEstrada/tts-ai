import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import ApiService, { Speaker } from '@/api/ApiService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const HomePage: React.FC = () => {
  const [text, setText] = useState('Hello world, this is a test of TTS with streaming.');
  const [isLoading, setIsLoading] = useState(false);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [speaker, setSpeaker] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [showDownload, setShowDownload] = useState(false);
  const [engine, setEngine] = useState<'coqui' | 'google'>('google');
  const [googleVoice, setGoogleVoice] = useState<string>('Puck');

  const audioRef = useRef<HTMLAudioElement>(null);
  const ws = useRef<WebSocket | null>(null);
  const audioQueue = useRef<Uint8Array[]>([]);
  const receivedChunks = useRef<Uint8Array[]>([]);
  const isPlaying = useRef(false);

  const googleVoices = ["Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina"];

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  useEffect(() => {
    const fetchSpeakers = async () => {
      const availableSpeakers = await ApiService.getSpeakers();
      setSpeakers(availableSpeakers);
      if (availableSpeakers.length > 0) {
        setSpeaker(availableSpeakers[0].id);
      }
    };
    fetchSpeakers();

    // WebSocket setup
    const wsUrl = `ws://${window.location.hostname}/ws`; // Assuming backend is on the same host
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      addLog("WebSocket connection opened.");
    };

    ws.current.onmessage = (event) => {
      if (typeof event.data === "string") {
        addLog(`Server: ${event.data}`);
        if (event.data.includes("All chunks sent.")) {
          setShowDownload(true);
          setIsLoading(false);
        }
      } else {
        event.data.arrayBuffer().then((buf: ArrayBuffer) => {
          const chunk = new Uint8Array(buf);
          receivedChunks.current.push(chunk);
          audioQueue.current.push(chunk);
          if (!isPlaying.current) {
            playNext();
          }
        });
      }
    };

    ws.current.onclose = () => {
      addLog("WebSocket connection closed.");
    };

    ws.current.onerror = (error) => {
      addLog(`WebSocket error: ${error instanceof Error ? error.message : 'An error occurred'}`);
      setIsLoading(false);
    };

    return () => {
      ws.current?.close();
    };
  }, []);

  const playNext = () => {
    if (audioQueue.current.length === 0) {
      isPlaying.current = false;
      addLog("Playback queue empty. Waiting...");
      return;
    }
    isPlaying.current = true;
    const chunk = audioQueue.current.shift();
    if (chunk) {
      const blob = new Blob([chunk], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play().then(() => {
          addLog("Playing next chunk.");
          audioRef.current!.onended = () => {
            URL.revokeObjectURL(url);
            playNext();
          };
        }).catch(err => {
          addLog(`Playback error: ${err.message}`);
          playNext();
        });
      }
    }
  };

  const handleSynthesize = async () => {
    if (!text.trim()) {
      toast.error("Please enter some text to synthesize.");
      return;
    }

    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      toast.error("WebSocket is not connected.");
      return;
    }

    setIsLoading(true);
    setShowDownload(false);
    audioQueue.current = [];
    receivedChunks.current = [];
    isPlaying.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }

    addLog(`Sending text to server for ${engine} TTS...`);

    const payload = {
      text,
      engine,
      ...(engine === 'coqui' && { speaker }),
      ...(engine === 'google' && { voice: googleVoice }),
    };

    ws.current.send(JSON.stringify(payload));
  };

  const handleDownload = () => {
    if (receivedChunks.current.length === 0) {
        addLog("No audio to download.");
        return;
    }
    addLog("Preparing audio file for download...");
    
    const firstChunk = receivedChunks.current[0];
    const header = firstChunk.slice(0, 44);
    const audioDataChunks = [firstChunk.slice(44)];
    
    let totalAudioDataSize = firstChunk.length - 44;

    for (let i = 1; i < receivedChunks.current.length; i++) {
        const chunk = receivedChunks.current[i];
        const audioData = chunk.slice(44);
        audioDataChunks.push(audioData);
        totalAudioDataSize += audioData.length;
    }
    
    const view = new DataView(header.buffer);
    view.setUint32(4, 36 + totalAudioDataSize, true); // RIFF chunk size
    view.setUint32(40, totalAudioDataSize, true); // Sub-chunk 2 (data) size

    const combinedBlob = new Blob([header, ...audioDataChunks], { type: 'audio/wav' });
    const url = URL.createObjectURL(combinedBlob);
    
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'full_audio.wav';
    document.body.appendChild(a);
    a.click();
    
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    addLog("Download started.");
  };

  return (
    <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Text to Speech</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="engine-select">TTS Engine</Label>
              <Select value={engine} onValueChange={(value) => setEngine(value as 'google' | 'coqui')}>
                <SelectTrigger id="engine-select">
                  <SelectValue placeholder="Select an engine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="google">Google TTS</SelectItem>
                  <SelectItem value="coqui">Coqui TTS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="text-input">Text</Label>
              <Textarea
                id="text-input"
                placeholder="Enter your text here..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
              />
            </div>
            {engine === 'coqui' ? (
              <div className="space-y-2">
                <Label htmlFor="speaker-select">Speaker</Label>
                <Select value={speaker} onValueChange={setSpeaker} disabled={speakers.length === 0}>
                  <SelectTrigger id="speaker-select">
                    <SelectValue placeholder="Select a speaker" />
                  </SelectTrigger>
                  <SelectContent>
                    {speakers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="google-voice-select">Google Voice</Label>
                <Select value={googleVoice} onValueChange={setGoogleVoice}>
                  <SelectTrigger id="google-voice-select">
                    <SelectValue placeholder="Select a voice" />
                  </SelectTrigger>
                  <SelectContent>
                    {googleVoices.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={handleSynthesize} disabled={isLoading || !text.trim()}>
              {isLoading ? 'Synthesizing...' : 'Synthesize & Stream'}
            </Button>
            <audio ref={audioRef} controls className="w-full mt-4" />
            {showDownload && (
              <Button onClick={handleDownload} className="mt-2">
                Download Full Audio
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-96 bg-muted rounded-md p-4 overflow-y-auto text-sm">
              {logs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default HomePage;
