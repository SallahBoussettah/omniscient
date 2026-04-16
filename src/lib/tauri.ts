import { invoke } from "@tauri-apps/api/core";

export async function listAudioDevices(): Promise<string[]> {
  return invoke("list_audio_devices");
}

export async function startRecording(): Promise<string> {
  return invoke("start_recording");
}

export async function stopRecording(): Promise<string> {
  return invoke("stop_recording");
}

export async function getAudioLevel(): Promise<number> {
  return invoke("get_audio_level");
}

export async function isRecording(): Promise<boolean> {
  return invoke("is_recording");
}

export async function getDbStats(): Promise<{
  conversations: number;
  memories: number;
  action_items: number;
  screenshots: number;
}> {
  return invoke("get_db_stats");
}

export async function hasWhisperModel(): Promise<boolean> {
  return invoke("has_whisper_model");
}

export async function initTranscriber(): Promise<string> {
  return invoke("init_transcriber");
}

export interface TranscriptSegment {
  text: string;
  start_ms: number;
  end_ms: number;
}

export async function transcribePending(): Promise<TranscriptSegment[]> {
  return invoke("transcribe_pending");
}
