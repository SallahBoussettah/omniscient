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

export async function checkLlmStatus(): Promise<boolean> {
  return invoke("check_llm_status");
}

export async function processConversation(conversationId: string): Promise<string> {
  return invoke("process_conversation_cmd", { conversationId });
}

export interface Conversation {
  id: string;
  title: string | null;
  overview: string | null;
  emoji: string | null;
  category: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
}

export async function getConversations(): Promise<Conversation[]> {
  return invoke("get_conversations");
}

export interface MemoryItem {
  id: string;
  content: string;
  category: string;
  conversation_id: string | null;
  created_at: string;
}

export async function getMemories(): Promise<MemoryItem[]> {
  return invoke("get_memories");
}

export interface ActionItemData {
  id: string;
  description: string;
  completed: boolean;
  priority: string;
  conversation_id: string | null;
  created_at: string;
}

export async function getActionItems(): Promise<ActionItemData[]> {
  return invoke("get_action_items");
}

export async function toggleActionItem(id: string, completed: boolean): Promise<string> {
  return invoke("toggle_action_item", { id, completed });
}
