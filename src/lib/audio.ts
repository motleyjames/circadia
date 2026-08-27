export type SoundscapeId = "brown" | "pink" | "rain" | "ocean";

type NoiseHandle = {
  stop: () => void;
};

let shared: AudioContext | null = null;
let activeStop: (() => void) | null = null;

function createContext(): AudioContext {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: new () => AudioContext }).webkitAudioContext;
  return new Ctor();
}

function context(): AudioContext {
  if (!shared || shared.state === "closed") {
    shared = createContext();
  }
  return shared;
}

/** Must run inside a tap. Browsers otherwise start the graph `suspended` and you get silence. */
export async function unlockAudio(): Promise<void> {
  const ctx = context();
  if (ctx.state === "suspended") await ctx.resume();
}

export function stopAllSoundscapes() {
  activeStop?.();
  activeStop = null;
}

function brownFromWhite(white: Float32Array): Float32Array {
  const out = new Float32Array(white.length);
  let last = 0;
  for (let i = 0; i < white.length; i++) {
    last = (last + 0.02 * white[i]) / 1.02;
    out[i] = Math.max(-1, Math.min(1, last * 3.5));
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
    out[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11));
    b6 = w * 0.115926;
  }
  return out;
}

function fillBuffer(ctx: AudioContext, kind: SoundscapeId): AudioBuffer {
  const seconds = 8;
  const buffer = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const white = new Float32Array(buffer.length);
    for (let i = 0; i < white.length; i++) white[i] = Math.random() * 2 - 1;
    const shaped = kind === "brown" ? brownFromWhite(white) : pinkFromWhite(white);
    buffer.getChannelData(ch).set(shaped);
  }
  return buffer;
}

export function startSoundscape(kind: SoundscapeId, volume = 0.2): NoiseHandle {
  stopAllSoundscapes();
  const ctx = context();
  void ctx.resume();

  const source = ctx.createBufferSource();
  source.buffer = fillBuffer(ctx, kind);
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  if (kind === "ocean") {
    filter.type = "lowpass";
    filter.frequency.value = 480;
  } else if (kind === "rain") {
    filter.type = "highpass";
    filter.frequency.value = 900;
  } else if (kind === "brown") {
    filter.type = "lowpass";
    filter.frequency.value = 400;
  } else {
    filter.type = "lowpass";
    filter.frequency.value = 1800;
  }

  const gain = ctx.createGain();
  gain.gain.value = 0.0001;

  let lfo: OscillatorNode | null = null;
  if (kind === "ocean" || kind === "rain") {
    lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = kind === "ocean" ? 0.08 : 0.28;
    lfoGain.gain.value = kind === "ocean" ? 0.06 : 0.03;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start();
  }

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start();
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 1.2);

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (activeStop === stop) activeStop = null;
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
    gain.gain.linearRampToValueAtTime(0.0001, t + 0.4);
    window.setTimeout(() => {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      try {
        lfo?.stop();
      } catch {
        /* never started */
      }
      try {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch {
        /* context gone */
      }
    }, 450);
  };

  activeStop = stop;
  return { stop };
}
