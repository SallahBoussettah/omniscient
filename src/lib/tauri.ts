import { invoke } from "@tauri-apps/api/core";

export async function listAudioDevices(): Promise<string[]> {
  return invoke("list_audio_devices");
}

/** Returns the new conversation_id */
export async function startRecording(): Promise<string> {
  return invoke("start_recording");
}

/** Returns the conversation_id that was just stopped (or null if none active) */
export async function stopRecording(): Promise<string | null> {
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

export async function getActiveModel(): Promise<string> {
  return invoke("get_active_model");
}

export async function setActiveModel(model: string): Promise<string> {
  return invoke("set_active_model", { model });
}

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}

export async function listOllamaModels(): Promise<OllamaModel[]> {
  return invoke("list_ollama_models");
}

export async function processConversation(conversationId: string): Promise<string> {
  return invoke("process_conversation_cmd", { conversationId });
}

export async function reprocessConversation(conversationId: string): Promise<string> {
  return invoke("reprocess_conversation", { conversationId });
}

export async function deleteConversation(id: string): Promise<string> {
  return invoke("delete_conversation", { id });
}

export interface TranscriptSegmentRow {
  id: string;
  text: string;
  speaker: string | null;
  start_time: number;
  end_time: number;
}

export interface ConversationDetail {
  conversation: Conversation;
  segments: TranscriptSegmentRow[];
  memories: MemoryItem[];
  tasks: ActionItemData[];
}

export async function getConversationDetail(id: string): Promise<ConversationDetail> {
  return invoke("get_conversation_detail", { id });
}

// ===== CHAT (RAG) =====

export interface SearchHit {
  entity_type: string;
  entity_id: string;
  text: string;
  score: number;
  created_at: string;
}

export interface ChatTurnResult {
  answer: string;
  sources: SearchHit[];
  session_id: string;
  user_message_id: string;
  assistant_message_id: string;
}

export async function chatSend(
  message: string,
  sessionId: string | null
): Promise<ChatTurnResult> {
  return invoke("chat_send", { message, sessionId });
}

export interface ChatSession {
  id: string;
  title: string | null;
  updated_at: string;
}

export async function listChatSessions(): Promise<ChatSession[]> {
  return invoke("list_chat_sessions");
}

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  created_at: string;
}

export async function getChatMessages(sessionId: string): Promise<ChatMessage[]> {
  return invoke("get_chat_messages", { sessionId });
}

export async function deleteChatSession(sessionId: string): Promise<string> {
  return invoke("delete_chat_session", { sessionId });
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
