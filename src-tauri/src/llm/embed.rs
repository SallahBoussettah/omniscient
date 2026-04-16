use serde::{Deserialize, Serialize};

const EMBED_MODEL: &str = "nomic-embed-text";
const OLLAMA_BASE: &str = "http://localhost:11434";

#[derive(Serialize)]
struct EmbedRequest<'a> {
    model: &'a str,
    input: &'a str,
}

#[derive(Deserialize)]
struct EmbedResponse {
    embeddings: Vec<Vec<f32>>,
}

pub struct Embedder {
    http: reqwest::Client,
    model: String,
}

impl Embedder {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::new(),
            model: EMBED_MODEL.to_string(),
        }
    }

    pub fn model_name(&self) -> &str {
        &self.model
    }

    /// Embed a single text into a vector.
    pub async fn embed(&self, text: &str) -> Result<Vec<f32>, String> {
        let url = format!("{}/api/embed", OLLAMA_BASE);
        let req = EmbedRequest {
            model: &self.model,
            input: text,
        };

        let resp = self
            .http
            .post(&url)
            .json(&req)
            .send()
            .await
            .map_err(|e| format!("Embed request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Embed error {}: {}", status, body));
        }

        let parsed: EmbedResponse = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse embed response: {}", e))?;

        parsed
            .embeddings
            .into_iter()
            .next()
            .ok_or("No embedding returned".to_string())
    }
}

/// Pack an f32 vector to bytes for SQLite BLOB storage (little-endian).
pub fn vec_to_blob(v: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(v.len() * 4);
    for f in v {
        out.extend_from_slice(&f.to_le_bytes());
    }
    out
}

/// Unpack bytes into an f32 vector.
pub fn blob_to_vec(b: &[u8]) -> Vec<f32> {
    b.chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

/// Cosine similarity between two vectors.
pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0_f32;
    let mut na = 0.0_f32;
    let mut nb = 0.0_f32;
    for i in 0..a.len() {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    let denom = (na.sqrt()) * (nb.sqrt());
    if denom < 1e-9 {
        0.0
    } else {
        dot / denom
    }
}
