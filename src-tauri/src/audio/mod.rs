pub mod capture;
pub mod transcribe;
pub mod vad;

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

/// Shared audio state accessible from Tauri commands
pub struct AudioState {
    pub is_recording: AtomicBool,
    pub audio_level: AtomicU32, // RMS level 0-100
}

impl AudioState {
    pub fn new() -> Self {
        Self {
            is_recording: AtomicBool::new(false),
            audio_level: AtomicU32::new(0),
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
    }

    pub fn is_recording(&self) -> bool {
        self.is_recording.load(Ordering::Relaxed)
    }
}
