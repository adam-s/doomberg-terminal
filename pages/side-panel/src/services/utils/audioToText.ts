import { IAsrService } from '@src/side-panel/worker/asr/asr.service';
import { VSBuffer } from 'vs/base/common/buffer';

let audioContextInstance: AudioContext | undefined;

function getAudioContext(): AudioContext {
  if (!audioContextInstance) {
    if (window.AudioContext) {
      audioContextInstance = new window.AudioContext();
    } else {
      throw new Error('AudioContext is not supported in this browser.');
    }
  }
  return audioContextInstance;
}

async function resampleTo16k(audioBuffer: AudioBuffer): Promise<AudioBuffer> {
  const targetRate = 16000;

  // If already at target rate, return original buffer
  if (audioBuffer.sampleRate === targetRate) {
    return audioBuffer;
  }

  // Calculate new length for resampled audio
  const length = Math.ceil(audioBuffer.duration * targetRate);

  // Create offline context for resampling (mono output)
  const offlineCtx = new OfflineAudioContext(1, length, targetRate);
  const src = offlineCtx.createBufferSource();

  src.buffer = audioBuffer;
  src.connect(offlineCtx.destination);
  src.start(0);

  return offlineCtx.startRendering();
}

async function getSourceAudioBuffer(source: string | ArrayBuffer): Promise<ArrayBuffer> {
  if (typeof source === 'string') {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio from URL: ${response.status} ${response.statusText}`);
    }
    return response.arrayBuffer();
  }
  // If source is already an ArrayBuffer, return it directly.
  // The caller is responsible for creating a copy if the buffer is to be consumed by an operation
  // that might take ownership (e.g., decodeAudioData, which can transfer the buffer).
  return source;
}

// New helper function to trim AudioBuffer
function trimAudioBuffer(
  audioContext: AudioContext,
  originalBuffer: AudioBuffer,
  maxDurationSeconds: number,
): AudioBuffer {
  // No trimming needed if original duration is already within or equal to the max duration
  if (originalBuffer.duration <= maxDurationSeconds) {
    return originalBuffer;
  }

  // Calculate the number of frames for the desired maximum duration.
  // AudioBuffer length must be positive.
  const targetSampleFrames = Math.max(
    1,
    Math.floor(maxDurationSeconds * originalBuffer.sampleRate),
  );

  const trimmedBuffer = audioContext.createBuffer(
    originalBuffer.numberOfChannels,
    targetSampleFrames,
    originalBuffer.sampleRate,
  );

  for (let i = 0; i < originalBuffer.numberOfChannels; i++) {
    const channelData = originalBuffer.getChannelData(i);
    // .subarray(begin, end) extracts up to (but not including) end.
    const segmentToCopy = channelData.subarray(0, targetSampleFrames);
    trimmedBuffer.copyToChannel(segmentToCopy, i);
  }

  return trimmedBuffer;
}

export const audioToText = async (
  source: string | ArrayBuffer,
  asrService: IAsrService,
  maxDurationInSeconds?: number, // New optional parameter
): Promise<string> => {
  const startTime = performance.now();
  console.log('[audioToText] Starting audio processing.');

  const rawAudioBuffer = await getSourceAudioBuffer(source);

  const audioContext = getAudioContext();
  // It's important to pass a copy to decodeAudioData as it can take ownership of the buffer.
  let decodedAudioBuffer = await audioContext.decodeAudioData(rawAudioBuffer.slice(0));
  console.log(
    `[audioToText] Initial decoded audio duration: ${decodedAudioBuffer.duration} seconds.`,
  );

  // Trim the audio buffer if maxDurationInSeconds is provided and valid
  if (maxDurationInSeconds !== undefined) {
    if (maxDurationInSeconds <= 0) {
      const errorMsg = 'maxDurationInSeconds must be a positive value.';
      console.error(`[audioToText] Error: ${errorMsg}`);
      throw new Error(errorMsg);
    }
    // Only trim if the decoded buffer is longer than the specified max duration
    if (decodedAudioBuffer.duration > maxDurationInSeconds) {
      console.log(
        `[audioToText] Trimming audio from ${decodedAudioBuffer.duration}s to ${maxDurationInSeconds}s.`,
      );
      decodedAudioBuffer = trimAudioBuffer(audioContext, decodedAudioBuffer, maxDurationInSeconds);
      console.log(`[audioToText] Trimmed audio duration: ${decodedAudioBuffer.duration} seconds.`);
    } else {
      console.log(
        `[audioToText] Audio duration (${decodedAudioBuffer.duration}s) is already within the max duration (${maxDurationInSeconds}s). No trimming needed.`,
      );
    }
  }

  // Resample to 16kHz if needed (Whisper ASR model requirement)
  console.log('[audioToText] Resampling audio to 16kHz.');
  const resampledBuffer = await resampleTo16k(decodedAudioBuffer);
  console.log(`[audioToText] Resampled audio duration: ${resampledBuffer.duration} seconds.`);

  // Extract mono PCM data (Float32Array) from the resampled buffer.
  // resampleTo16k is configured to output mono audio, so we take channel 0.
  const pcmData = resampledBuffer.getChannelData(0);

  // Direct VSBuffer creation without copying - uses the existing ArrayBuffer
  // This creates a Uint8Array view of the Float32Array's buffer.
  const vsBuffer = VSBuffer.wrap(
    new Uint8Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength),
  );

  console.log('[audioToText] Sending buffer to ASR service.');
  const result = await asrService.textFromBuffer(vsBuffer);
  const endTime = performance.now();
  console.log(
    `[audioToText] Processing finished. Total time: ${(endTime - startTime).toFixed(2)} ms.`,
  );
  return result;
};
