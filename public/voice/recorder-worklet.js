class FamilyRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(4096);
    this.offset = 0;
    this.port.onmessage = event => {
      if (event.data === 'flush') { this.flush(); this.port.postMessage({ flushed: true }); }
    };
  }
  flush() {
    if (!this.offset) return;
    const data = this.buffer.slice(0, this.offset);
    this.port.postMessage(data.buffer, [data.buffer]);
    this.offset = 0;
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) {
      let index = 0;
      while (index < channel.length) {
        const count = Math.min(channel.length - index, this.buffer.length - this.offset);
        this.buffer.set(channel.subarray(index, index + count), this.offset);
        this.offset += count; index += count;
        if (this.offset === this.buffer.length) this.flush();
      }
    }
    return true;
  }
}
registerProcessor('family-recorder', FamilyRecorder);
