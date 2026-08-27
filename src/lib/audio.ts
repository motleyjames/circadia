export type SoundscapeId = "brown" | "pink" | "rain" | "ocean";

type NoiseHandle = {
  stop: () => void;
};

function createNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function brownFromWhite(white: Float32Array): Float32Array {
  const out = new Float32Array(white.length);
  let last = 0;
  for (let i = 0; i < white.length; i++) {
    last = (last + 0.02 * white[i]) / 1.02;
    out[i] = last * 3.5;
  }
  return out;
}

function pinkFromWhite(white: Float32Array): Float32Array {
  const out = new Float32Array(white.length);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = 0; i < white.length; i++) {
    const w = white[i];
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return out;
}

function fillBuffer(
  ctx: AudioContext,
  kind: SoundscapeId,
): AudioBuffer {
  const seconds = 4;
  const buffer = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const white = new Float32Array(buffer.length);
    for (let i = 0; i < white.length; i++) white[i] = Math.random() * 2 - 1;
    let shaped: Float32Array;
    if (kind === "brown") shaped = brownFromWhite(white);
    else if (kind === "pink" || kind === "rain") shaped = pinkFromWhite(white);
    else shaped = pinkFromWhite(white);
    const dest = buffer.getChannelData(ch);
    for (let i = 0; i < dest.length; i++) dest[i] = shaped[i];
  }
  return buffer;
}

export function startSoundscape(kind: SoundscapeId, volume = 0.22): NoiseHandle {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const buffer = fillBuffer(ctx, kind);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  if (kind === "ocean") {
    filter.type = "lowpass";
    filter.frequency.value = 480;
    filter.Q.value = 0.7;
  } else if (kind === "rain") {
    filter.type = "highpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.5;
  } else if (kind === "brown") {
    filter.type = "lowpass";
    filter.frequency.value = 400;
  } else {
    filter.type = "lowpass";
    filter.frequency.value = 1800;
  }

  const gain = ctx.createGain();
  gain.gain.value = 0;

  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  if (kind === "ocean") {
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 0.08;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start();
  } else if (kind === "rain") {
    lfo.frequency.value = 0.3;
    lfoGain.gain.value = 0.04;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start();
  }

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start();

  const now = ctx.currentTime;
  gain.gain.linearRampToValueAtTime(volume, now + 1.4);

  return {
    stop: () => {
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.6);
      window.setTimeout(() => {
        try {
          source.stop();
          lfo.stop();
          void ctx.close();
        } catch {
          /* already closed */
        }
      }, 700);
    },
  };
}

/** Keep createNoiseBuffer referenced so tree-shaking doesn't confuse tests later. */
export const _noiseUtils = { createNoiseBuffer };
