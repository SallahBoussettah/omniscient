use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream};
use std::sync::{Arc, Mutex};

use super::AudioState;
use super::vad::Vad;

/// Target sample rate for VAD and transcription
const TARGET_SAMPLE_RATE: u32 = 16000;

/// Shared speech buffer — accumulated speech segments ready for transcription
pub struct SpeechBuffer {
    /// Buffered 16kHz mono f32 samples of current speech segment
    pub samples: Vec<f32>,
    /// Completed speech segments waiting for transcription
    pub completed_segments: Vec<Vec<f32>>,
    /// Number of consecutive silent chunks (to detect end of speech)
    silent_chunks: usize,
    /// Whether we're currently in a speech region
    in_speech: bool,
}

impl SpeechBuffer {
    pub fn new() -> Self {
        Self {
            samples: Vec::new(),
            completed_segments: Vec::new(),
            silent_chunks: 0,
            in_speech: false,
        }
    }

    /// Take all completed segments (drains the queue)
    pub fn take_segments(&mut self) -> Vec<Vec<f32>> {
        std::mem::take(&mut self.completed_segments)
    }
}

/// Lists available input devices
pub fn list_input_devices() -> Vec<String> {
    let host = cpal::default_host();
    host.input_devices()
        .map(|devices| devices.filter_map(|d| d.name().ok()).collect())
        .unwrap_or_default()
}

/// Starts recording with VAD-based speech segmentation.
/// Speech segments are accumulated in the SpeechBuffer.
pub fn start_capture(
    state: Arc<AudioState>,
    vad: Arc<Mutex<Vad>>,
    speech_buffer: Arc<Mutex<SpeechBuffer>>,
) -> Result<Stream, String> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or("No input device available")?;

    let device_name = device.name().unwrap_or("unknown".to_string());
    log::info!("Using input device: {}", device_name);

    let config = device
        .default_input_config()
        .map_err(|e| format!("Failed to get input config: {}", e))?;

    let source_rate = config.sample_rate().0;
    let source_channels = config.channels() as usize;
    log::info!(
        "Input: {} channels, {}Hz, {:?}",
        source_channels,
        source_rate,
        config.sample_format()
    );

    let state_clone = state.clone();
    let err_fn = |err: cpal::StreamError| {
        log::error!("Audio stream error: {}", err);
    };

    // Accumulator for resampling
    let resample_state = Arc::new(Mutex::new(ResampleState::new(
        source_rate,
        TARGET_SAMPLE_RATE,
        source_channels,
    )));

    let stream = match config.sample_format() {
        SampleFormat::F32 => device
            .build_input_stream(
                &config.into(),
                {
                    let resample_state = resample_state.clone();
                    let vad = vad.clone();
                    let speech_buffer = speech_buffer.clone();
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        process_audio(
                            &state_clone,
                            &resample_state,
                            &vad,
                            &speech_buffer,
                            data,
                        );
                    }
                },
                err_fn,
                None,
            )
            .map_err(|e| format!("Failed to build stream: {}", e))?,
        SampleFormat::I16 => device
            .build_input_stream(
                &config.into(),
                {
                    let resample_state = resample_state.clone();
                    let vad = vad.clone();
                    let speech_buffer = speech_buffer.clone();
                    let state_clone2 = state_clone.clone();
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        let floats: Vec<f32> = data.iter().map(|&s| s as f32 / 32768.0).collect();
                        process_audio(
                            &state_clone2,
                            &resample_state,
                            &vad,
                            &speech_buffer,
                            &floats,
                        );
                    }
                },
                err_fn,
                None,
            )
            .map_err(|e| format!("Failed to build stream: {}", e))?,
        format => return Err(format!("Unsupported sample format: {:?}", format)),
    };

    stream
        .play()
        .map_err(|e| format!("Failed to play stream: {}", e))?;

    state.set_recording(true);
    log::info!("Audio capture started with VAD");

    Ok(stream)
}

/// Process incoming audio: downsample to 16kHz mono, run VAD, buffer speech
fn process_audio(
    state: &AudioState,
    resample_state: &Mutex<ResampleState>,
    vad: &Mutex<Vad>,
    speech_buffer: &Mutex<SpeechBuffer>,
    samples: &[f32],
) {
    // Update RMS level for UI
    let rms = compute_rms(samples);
    state.set_level(rms * 5.0);

    // Downsample to 16kHz mono
    let mut rs = resample_state.lock().unwrap();
    let mono_16k = rs.process(samples);

    if mono_16k.is_empty() {
        return;
    }

    // Feed chunks of 512 samples to VAD
    let mut vad_guard = vad.lock().unwrap();
    let mut buf_guard = speech_buffer.lock().unwrap();

    for chunk in mono_16k.chunks(512) {
        if chunk.len() < 512 {
            // Accumulate partial chunk for next round
            rs.remainder.extend_from_slice(chunk);
            break;
        }

        let is_speech = vad_guard.is_speech(chunk);

        if is_speech {
            // Note: we mark speech here on every speech chunk so silence
            // detection is responsive. This is what auto-stop polls.
            state.mark_speech();
            buf_guard.in_speech = true;
            buf_guard.silent_chunks = 0;
            buf_guard.samples.extend_from_slice(chunk);
        } else if buf_guard.in_speech {
            buf_guard.silent_chunks += 1;
            // Include a bit of trailing silence for natural boundaries
            buf_guard.samples.extend_from_slice(chunk);

            // After ~15 silent chunks (~480ms), finalize the segment
            if buf_guard.silent_chunks >= 15 {
                if buf_guard.samples.len() > TARGET_SAMPLE_RATE as usize / 2 {
                    // Only keep segments longer than 0.5s
                    let segment = std::mem::take(&mut buf_guard.samples);
                    let duration = segment.len() as f32 / TARGET_SAMPLE_RATE as f32;
                    log::info!("Speech segment captured: {:.1}s ({} samples)", duration, segment.len());
                    buf_guard.completed_segments.push(segment);
                } else {
                    buf_guard.samples.clear();
                }
                buf_guard.in_speech = false;
                buf_guard.silent_chunks = 0;
            }
        }
    }
}

fn compute_rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum_sq: f32 = samples.iter().map(|s| s * s).sum();
    (sum_sq / samples.len() as f32).sqrt()
}

/// Simple downsampling state: converts multi-channel arbitrary-rate to 16kHz mono
struct ResampleState {
    source_rate: u32,
    target_rate: u32,
    channels: usize,
    accumulator: f64,
    step: f64,
    remainder: Vec<f32>,
}

impl ResampleState {
    fn new(source_rate: u32, target_rate: u32, channels: usize) -> Self {
        Self {
            source_rate,
            target_rate,
            channels,
            accumulator: 0.0,
            step: source_rate as f64 / target_rate as f64,
            remainder: Vec::new(),
        }
    }

    /// Convert interleaved multi-channel audio to 16kHz mono
    fn process(&mut self, input: &[f32]) -> Vec<f32> {
        // First, mix down to mono
        let mono: Vec<f32> = input
            .chunks(self.channels)
            .map(|frame| {
                let sum: f32 = frame.iter().sum();
                sum / self.channels as f32
            })
            .collect();

        // If same rate, return mono directly
        if self.source_rate == self.target_rate {
            return mono;
        }

        // Simple point resampling
        let mut output = Vec::new();
        let mut pos = self.accumulator;

        while (pos as usize) < mono.len() {
            let idx = pos as usize;
            output.push(mono[idx]);
            pos += self.step;
        }

        // Save fractional position for next buffer
        self.accumulator = pos - mono.len() as f64;

        output
    }
}
