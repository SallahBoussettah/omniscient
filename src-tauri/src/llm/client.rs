use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::RwLock;

/// OpenAI-compatible chat completion client (works with Ollama, OpenAI, etc.)
/// Model is hot-swappable via set_model().
pub struct LlmClient {
    base_url: String,
    model: RwLock<String>,
    http: reqwest::Client,
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<ToolDef>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    /// For role="tool" — the tool_call_id this is responding to
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    /// For role="tool" — the tool's name
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

impl ChatMessage {
    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: "system".into(),
            content: content.into(),
            tool_calls: None,
            tool_call_id: None,
            name: None,
        }
    }
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: "user".into(),
            content: content.into(),
            tool_calls: None,
            tool_call_id: None,
            name: None,
        }
    }
    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            role: "assistant".into(),
            content: content.into(),
            tool_calls: None,
            tool_call_id: None,
            name: None,
        }
    }
    pub fn tool_result(
        tool_call_id: impl Into<String>,
        name: impl Into<String>,
        content: impl Into<String>,
    ) -> Self {
        Self {
            role: "tool".into(),
            content: content.into(),
            tool_calls: None,
            tool_call_id: Some(tool_call_id.into()),
            name: Some(name.into()),
        }
    }
}

/// A tool definition sent to the model.
#[derive(Serialize, Clone, Debug)]
pub struct ToolDef {
    #[serde(rename = "type")]
    pub kind: String, // always "function"
    pub function: ToolFunction,
}

#[derive(Serialize, Clone, Debug)]
pub struct ToolFunction {
    pub name: String,
    pub description: String,
    pub parameters: Value, // JSON schema
}

/// A tool call from the model in its response.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type", default = "default_tool_type")]
    pub kind: String,
    pub function: ToolCallFunction,
}

fn default_tool_type() -> String {
    "function".to_string()
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ToolCallFunction {
    pub name: String,
    /// JSON-encoded arguments string
    pub arguments: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

impl LlmClient {
    pub fn new(base_url: &str, model: &str) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            model: RwLock::new(model.to_string()),
            http: reqwest::Client::new(),
        }
    }

    pub fn ollama(model: &str) -> Self {
        Self::new("http://localhost:11434", model)
    }

    pub fn model(&self) -> String {
        self.model.read().unwrap().clone()
    }

    pub fn set_model(&self, model: &str) {
        *self.model.write().unwrap() = model.to_string();
        log::info!("LLM model switched to: {}", model);
    }

    /// Simple system+user one-shot chat (no tools).
    pub async fn chat(&self, system_prompt: &str, user_prompt: &str) -> Result<String, String> {
        let messages = vec![
            ChatMessage::system(system_prompt),
            ChatMessage::user(user_prompt),
        ];
        self.chat_messages(&messages).await
    }

    /// Send messages and return the response text (no tool calls).
    pub async fn chat_messages(&self, messages: &[ChatMessage]) -> Result<String, String> {
        let msg = self.chat_messages_with_tools(messages, None).await?;
        Ok(msg.content)
    }

    /// Send messages with optional tool defs. Returns the raw assistant message
    /// (which may contain tool_calls).
    pub async fn chat_messages_with_tools(
        &self,
        messages: &[ChatMessage],
        tools: Option<&[ToolDef]>,
    ) -> Result<ChatMessage, String> {
        let url = format!("{}/v1/chat/completions", self.base_url);

        let request = ChatRequest {
            model: self.model(),
            messages: messages.to_vec(),
            temperature: 0.3,
            stream: false,
            tools: tools.map(|t| t.to_vec()),
        };

        let resp = self
            .http
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("LLM request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("LLM error {}: {}", status, body));
        }

        let response: ChatResponse = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse LLM response: {}", e))?;

        response
            .choices
            .into_iter()
            .next()
            .map(|c| c.message)
            .ok_or("No response from LLM".to_string())
    }

    pub async fn health_check(&self) -> Result<bool, String> {
        let url = format!("{}/v1/models", self.base_url);
        match self.http.get(&url).send().await {
            Ok(resp) => Ok(resp.status().is_success()),
            Err(_) => Ok(false),
        }
    }
}
