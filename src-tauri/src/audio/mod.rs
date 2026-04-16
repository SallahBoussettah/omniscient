pub mod capture;
pub mod transcribe;
pub mod vad;

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// Shared audio state accessible from Tauri commands
pub struct AudioState {
    pub is_recording: AtomicBool,
    pub audio_level: AtomicU32, // RMS level 0-100
    /// Unix epoch ms of the last detected speech segment.
    /// Used by the frontend to compute silence-since-last-speech for auto-stop.
    pub last_speech_at_ms: AtomicU64,
    /// Unix epoch ms of the recording start.
    pub recording_started_at_ms: AtomicU64,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

impl AudioState {
    pub fn new() -> Self {
        Self {
            is_recording: AtomicBool::new(false),
            audio_level: AtomicU32::new(0),
            last_speech_at_ms: AtomicU64::new(0),
            recording_started_at_ms: AtomicU64::new(0),
        }
    }

    pub fn set_level(&self, level: f32) {
        let clamped = (level * 100.0).clamp(0.0, 100.0) as u32;
        self.audio_level.store(clamped, Ordering::Relaxed);
    }

    pub fn get_level(&self) -> u32 {
        self.audio_level.load(Ordering::Relaxed)
    }

    pub fn set_recording(&self, recording: bool) {
        self.is_recording.store(recording, Ordering::Relaxed);
        if recording {
            let now = now_ms();
            self.recording_started_at_ms.store(now, Ordering::Relaxed);
            self.last_speech_at_ms.store(now, Ordering::Relaxed);
        }
    }

    pub fn is_recording(&self) -> bool {
        self.is_recording.load(Ordering::Relaxed)
    }

    /// Called by the capture pipeline when VAD finalizes a speech segment.
    pub fn mark_speech(&self) {
        self.last_speech_at_ms.store(now_ms(), Ordering::Relaxed);
    }

    /// Milliseconds since the last detected speech segment (or recording start).
    pub fn silence_ms(&self) -> u64 {
        let last = self.last_speech_at_ms.load(Ordering::Relaxed);
        if last == 0 {
            return 0;
        }
        now_ms().saturating_sub(last)
    }

    /// Milliseconds since recording started.
    pub fn recording_ms(&self) -> u64 {
        let start = self.recording_started_at_ms.load(Ordering::Relaxed);
        if start == 0 {
            return 0;
        }
        now_ms().saturating_sub(start)
    }
}
