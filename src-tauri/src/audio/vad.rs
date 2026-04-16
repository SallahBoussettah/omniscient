use voice_activity_detector::VoiceActivityDetector;

const SAMPLE_RATE: i64 = 16000;
const CHUNK_SIZE: usize = 512; // Required for 16kHz by Silero V5

/// Wraps the Silero VAD model for speech detection
pub struct Vad {
    detector: VoiceActivityDetector,
    threshold: f32,
}

impl Vad {
    pub fn new() -> Result<Self, String> {
        let detector = VoiceActivityDetector::builder()
            .sample_rate(SAMPLE_RATE)
            .chunk_size(CHUNK_SIZE)
            .build()
            .map_err(|e| format!("Failed to initialize VAD: {}", e))?;

        log::info!(
            "Silero VAD initialized ({}Hz, chunk={})",
            SAMPLE_RATE,
            CHUNK_SIZE
        );
        Ok(Self {
            detector,
            threshold: 0.5,
        })
    }

    /// Process exactly 512 samples of 16kHz mono f32 audio.
    /// Returns speech probability (0.0 - 1.0).
    pub fn predict(&mut self, samples: &[f32]) -> f32 {
        self.detector.predict(samples.iter().copied())
    }

    /// Returns true if the audio chunk likely contains speech
    pub fn is_speech(&mut self, samples: &[f32]) -> bool {
        self.predict(samples) > self.threshold
    }

    /// Reset internal state (call between conversations)
    pub fn reset(&mut self) {
        self.detector.reset();
    }

    /// Get the required chunk size (512 for 16kHz)
    pub fn chunk_size(&self) -> usize {
        CHUNK_SIZE
    }
}
