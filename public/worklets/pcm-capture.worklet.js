/* global sampleRate, registerProcessor, AudioWorkletProcessor */
/**
 * AudioWorklet: converts the (mixed, mono) input stream from the AudioContext's
 * native rate (typically 48 kHz) to 16 kHz signed 16-bit PCM and posts fixed-size
 * frames to the main thread. Runs on the audio rendering thread, so the UI thread
 * never does per-sample work.
 *
 * Resampling uses a box filter (average of the input samples that fall into each
 * output sample), which also acts as a simple anti-aliasing low-pass for speech.
 */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const processorOptions = (options && options.processorOptions) || {};
    this.targetRate = processorOptions.targetSampleRate || 16000;
    this.frameSamples = processorOptions.frameSamples || 800;
    this.ratio = sampleRate / this.targetRate;
    this.position = 0;
    this.accumulator = 0;
    this.accumulated = 0;
    this.frame = new Int16Array(this.frameSamples);
    this.offset = 0;
    this.sumSquares = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i += 1) {
      this.accumulator += channel[i];
      this.accumulated += 1;
      this.position += 1;
      if (this.position < this.ratio) continue;
      this.position -= this.ratio;

      let sample = this.accumulator / this.accumulated;
      this.accumulator = 0;
      this.accumulated = 0;
      sample = sample > 1 ? 1 : sample < -1 ? -1 : sample;
      this.frame[this.offset] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      this.sumSquares += sample * sample;
      this.offset += 1;

      if (this.offset === this.frameSamples) {
        const rms = Math.sqrt(this.sumSquares / this.frameSamples);
        const buffer = this.frame.buffer;
        this.port.postMessage({ type: 'frame', pcm: buffer, rms }, [buffer]);
        this.frame = new Int16Array(this.frameSamples);
        this.offset = 0;
        this.sumSquares = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor);
