// src/api/ApiService.ts
import { toast } from "sonner";

export interface Speaker {
  id: string;
  name: string;
}

export default class ApiService {
  // Adjust this to your actual backend URL
  private static BASE_URL = "http://localhost:80/api";

  private static TTS_ENDPOINT = "/tts";
  private static SPEAKERS_ENDPOINT = "/speakers";

  static async getSpeakers(): Promise<Speaker[]> {
    try {
      // const response = await fetch(`${this.BASE_URL}${this.SPEAKERS_ENDPOINT}`);
      // if (!response.ok) {
      //   throw new Error("Failed to fetch speakers.");
      // }
      // return response.json();

      // Returning mock data for now
      return [
        { id: 'tts_models/en/ljspeech/fast_pitch', name: 'English Female Fast Pitch' },
        { id: 'tts_models/en/jenny/jenny', name: 'English Female Jenny' },
        { id: 'tts_models/es/css10/vits', name: 'Spanish Male' },
        
      ];
    } catch (error) {
      console.error("Error fetching speakers:", error);
      const message = error instanceof Error ? error.message : "An unknown error occurred.";
      toast.error(message);
      return [];
    }
  }

}
