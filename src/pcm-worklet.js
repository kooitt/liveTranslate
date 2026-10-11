// Runs on the dedicated audio rendering thread (not the main thread), so it
// can't import normal app modules — this is a plain, self-contained script.
// Converts the mic's float32 audio into Int16 PCM frames, replacing the
// deprecated ScriptProcessorNode(4096, 1, 1) with the same 4096-sample
// chunking the server already expects.
class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(4096);
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      this.buffer[this.offset++] = input[i];
      if (this.offset === this.buffer.length) this.flush();
    }
    return true;
  }

  flush() {
    const pcm = new Int16Array(this.buffer.length);
    for (let i = 0; i < this.buffer.length; i++) {
      const s = Math.max(-1, Math.min(1, this.buffer[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    this.offset = 0;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
