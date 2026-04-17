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

/** Discard the current recording — no transcription, no LLM, deletes the conv */
export async function cancelRecording(): Promise<void> {
  return invoke("cancel_recording");
}

// ===== FLOATING BAR =====

export async function toggleFloatingBar(): Promise<boolean> {
  return invoke("toggle_floating_bar");
}

export async function showFloatingBar(): Promise<void> {
  return invoke("show_floating_bar");
}

export async function hideFloatingBar(): Promise<void> {
  return invoke("hide_floating_bar");
}

export async function floatingBarResize(width: number, height: number): Promise<void> {
  return invoke("floating_bar_resize", { width, height });
}

export async function showMainWindow(): Promise<void> {
  return invoke("show_main_window");
}

/** Show main window AND emit an event so it navigates to a specific chat session. */
export async function showMainWindowWithChat(sessionId: string | null): Promise<void> {
  return invoke("show_main_window_with_chat", { sessionId });
}

export async function getAudioLevel(): Promise<number> {
  return invoke("get_audio_level");
}

export async function isRecording(): Promise<boolean> {
  return invoke("is_recording");
}

export interface RecordingStatus {
  is_recording: boolean;
  audio_level: number;
  silence_ms: number;
  recording_ms: number;
}

export async function getRecordingStatus(): Promise<RecordingStatus> {
  return invoke("get_recording_status");
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

/** Live preview of the in-progress speech buffer (no DB write).
 *  Returns "" if there's not enough audio yet. */
export async function transcribePartial(): Promise<string> {
  return invoke("transcribe_partial");
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
  /** Names of tools the LLM invoked during this turn (e.g. "create_task",
   *  "end_voice_session"). Voice mode reads this to know when to close. */
  tools_called: string[];
}

export async function chatSend(
  message: string,
  sessionId: string | null
): Promise<ChatTurnResult> {
  return invoke("chat_send", { message, sessionId });
}

/** Streaming variant — fires `chat-token` events with text deltas while the
 *  model generates. Resolves with the full result once finished. */
export async function chatSendStream(
  message: string,
  sessionId: string | null
): Promise<ChatTurnResult> {
  return invoke("chat_send_stream", { message, sessionId });
}

export interface ChatTokenEvent {
  /** The id of the assistant message being streamed (matches assistant_message_id). */
  id: string;
  /** Text delta to append. */
  delta: string;
}

// ===== TTS =====

export interface WordTiming {
  text: string;
  start_ms: number;
  end_ms: number;
}

export interface TtsClip {
  text: string;
  audio_b64: string;
  sample_rate: number;
  duration_ms: number;
  words: WordTiming[];
}

export async function ttsSpeak(
  text: string,
  voice?: string,
  speed?: number
): Promise<TtsClip> {
  return invoke("tts_speak", { text, voice, speed });
}

export async function ttsReady(): Promise<boolean> {
  return invoke("tts_ready");
}

// ===== EXPORT =====

export interface ExportResult {
  path: string;
  bytes: number;
}

/** Write a full JSON or Markdown export to `path`. Format is inferred
 *  from the extension (.md → markdown, else JSON). */
export async function exportData(path: string): Promise<ExportResult> {
  return invoke("export_data", { path });
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

export async function renameChatSession(sessionId: string, title: string): Promise<string> {
  return invoke("rename_chat_session", { sessionId, title });
}

/** Ask the LLM to generate a 3-5 word title and persist it. */
export async function autoTitleChatSession(sessionId: string): Promise<string> {
  return invoke("auto_title_chat_session", { sessionId });
}

// ===== TTS VOICE PREFERENCE =====

export async function getTtsVoice(): Promise<string> {
  return invoke("get_tts_voice");
}

export async function setTtsVoice(voice: string): Promise<string> {
  return invoke("set_tts_voice", { voice });
}

/** Curated set of Kokoro voices surfaced in the UI. The model ships ~54 but
 *  we keep the picker small. Add more here if you want to expose them. */
export const TTS_VOICE_OPTIONS = [
  { id: "af_heart",  label: "Heart",   description: "American female · warm, default" },
  { id: "af_bella",  label: "Bella",   description: "American female · soft, friendly" },
  { id: "af_sky",    label: "Sky",     description: "American female · airy, light" },
  { id: "bm_george", label: "George",  description: "British male · calm, measured" },
  { id: "bf_emma",   label: "Emma",    description: "British female · crisp, clear" },
] as const;

export interface ReindexResult {
  memories_indexed: number;
  conversations_indexed: number;
  total: number;
}

export async function reindexEmbeddings(): Promise<ReindexResult> {
  return invoke("reindex_embeddings");
}

// ===== MEMORY MANAGEMENT =====

export interface MemoryDetail {
  memory: {
    id: string;
    content: string;
    category: string;
    conversation_id: string | null;
    manually_added: boolean;
    created_at: string;
    updated_at: string;
    is_dismissed: boolean;
  };
  source_conversation: Conversation | null;
}

export async function getMemoryDetail(id: string): Promise<MemoryDetail> {
  return invoke("get_memory_detail", { id });
}

export async function updateMemory(
  id: string,
  content: string | null,
  category: string | null
): Promise<string> {
  return invoke("update_memory", { id, content, category });
}

export async function dismissMemory(id: string): Promise<string> {
  return invoke("dismiss_memory", { id });
}

export async function deleteMemory(id: string): Promise<string> {
  return invoke("delete_memory", { id });
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

export async function searchConversations(query: string): Promise<Conversation[]> {
  return invoke("search_conversations", { query });
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
  due_at: string | null;
  conversation_id: string | null;
  created_at: string;
}

export async function getActionItems(): Promise<ActionItemData[]> {
  return invoke("get_action_items");
}

export async function toggleActionItem(id: string, completed: boolean): Promise<string> {
  return invoke("toggle_action_item", { id, completed });
}

export async function deleteActionItem(id: string): Promise<string> {
  return invoke("delete_action_item", { id });
}

export async function clearCompletedTasks(): Promise<number> {
  return invoke("clear_completed_tasks");
}
