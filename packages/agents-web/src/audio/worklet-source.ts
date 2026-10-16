export const CAPTURE_PROCESSOR_NAME = 'cartesia-capture';

export const CAPTURE_WORKLET_SOURCE = `
class CartesiaCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length > 0) {
      const copy = new Float32Array(channel);
      this.port.postMessage(copy, [copy.buffer]);
    }
    return true;
  }
}
registerProcessor('${CAPTURE_PROCESSOR_NAME}', CartesiaCaptureProcessor);
`;
