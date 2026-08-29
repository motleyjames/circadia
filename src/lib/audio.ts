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
  // A 1-sample tick in the tap is what actually opens the Mac mixer.
  // resume() alone is not enough in WKWebView; HTMLAudioElement is a different gate.
  try {
    const tick = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = tick;
    const gain = ctx.createGain();
    gain.gain.value = 0.001;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  } catch {
    /* first frame */
  }
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

export type BreathPhase = "in" | "hold" | "out" | "rest";

export type BreathBedHandle = {
  setPhase: (phase: BreathPhase) => void;
  stop: () => void;
};

const BREATH_LEVEL: Record<BreathPhase, number> = {
  rest: 0.07,
  in: 0.13,
  hold: 0.13,
  out: 0.05,
};

const BREATH_RAMP: Record<BreathPhase, number> = {
  rest: 0.8,
  in: 3.6,
  hold: 0.12,
  out: 6.5,
};

let activeBedStop: (() => void) | null = null;
let bedDuck: GainNode | null = null;
let liveBed: BreathBedHandle | null = null;

export function getBreathBed(): BreathBedHandle | null {
  return liveBed;
}

export function stopBreathBed() {
  activeBedStop?.();
  activeBedStop = null;
}

/** Sit the pad under a spoken line, then rise again when the clip ends. */
export function duckBreathBed(factor: number, seconds = 0.28) {
  if (!bedDuck) return;
  const ctx = context();
  const t = ctx.currentTime;
  const to = Math.max(factor, 0.0001);
  bedDuck.gain.cancelScheduledValues(t);
  bedDuck.gain.setValueAtTime(Math.max(bedDuck.gain.value, 0.0001), t);
  bedDuck.gain.linearRampToValueAtTime(to, t + seconds);
}

/**
 * Low pad on the same graph as brown noise. Keeps the mixer running so guide clips can start.
 * Start it from a useEffect after unlockAudio() in the tap — same pattern as soundscapes.
 */
export function startBreathBed(): BreathBedHandle {
  stopBreathBed();
  const ctx = context();
  void ctx.resume();

  const a = ctx.createOscillator();
  const b = ctx.createOscillator();
  a.type = "sine";
  b.type = "sine";
  a.frequency.value = 73.4;
  b.frequency.value = 73.88;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 280;
  filter.Q.value = 0.7;

  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  const duck = ctx.createGain();
  duck.gain.value = 1;

  a.connect(filter);
  b.connect(filter);
  filter.connect(gain);
  gain.connect(duck);
  duck.connect(ctx.destination);
  bedDuck = duck;
  a.start();
  b.start();

  let stopped = false;
  let rampFrom = 0.0001;
  let rampTo = 0.0001;
  let rampAt = ctx.currentTime;
  let rampFor = 0.01;

  function levelNow(t: number): number {
    const p = Math.min(1, Math.max(0, (t - rampAt) / Math.max(rampFor, 0.001)));
    return rampFrom + (rampTo - rampFrom) * p;
  }

  function setPhase(phase: BreathPhase) {
    if (stopped) return;
    const t = ctx.currentTime;
    const from = Math.max(levelNow(t), 0.0001);
    const to = Math.max(BREATH_LEVEL[phase], 0.0001);
    const dur = BREATH_RAMP[phase];
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(from, t);
    gain.gain.linearRampToValueAtTime(to, t + dur);
    rampFrom = from;
    rampTo = to;
    rampAt = t;
    rampFor = dur;
  }

  setPhase("rest");

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (activeBedStop === stop) activeBedStop = null;
    if (liveBed && liveBed.stop === stop) liveBed = null;
    if (bedDuck === duck) bedDuck = null;
    const t = ctx.currentTime;
    const from = Math.max(levelNow(t), 0.0001);
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(from, t);
    gain.gain.linearRampToValueAtTime(0.0001, t + 0.4);
    window.setTimeout(() => {
      try {
        a.stop();
        b.stop();
      } catch {
        /* already stopped */
      }
      try {
        a.disconnect();
        b.disconnect();
        filter.disconnect();
        gain.disconnect();
        duck.disconnect();
      } catch {
        /* context gone */
      }
    }, 450);
  };

  activeBedStop = stop;
  liveBed = { setPhase, stop };
  return liveBed;
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

const decoded = new Map<string, AudioBuffer>();
let sampleStop: (() => void) | null = null;
let sampleGen = 0;

function decodePcm(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  const first = data.slice(0);
  const promised = ctx.decodeAudioData(first);
  if (promised && typeof promised.then === "function") {
    return promised.catch(() => {
      const retry = data.slice(0);
      return new Promise<AudioBuffer>((resolve, reject) => {
        ctx.decodeAudioData(retry, resolve, reject);
      });
    });
  }
  return new Promise((resolve, reject) => {
    ctx.decodeAudioData(data.slice(0), resolve, reject);
  });
}

/** Fetch + decode through the same AudioContext the soundscapes use. */
export async function decodeUrl(url: string): Promise<AudioBuffer> {
  const hit = decoded.get(url);
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`audio ${res.status} ${url}`);
  const data = await res.arrayBuffer();
  const buffer = await decodePcm(context(), data);
  decoded.set(url, buffer);
  return buffer;
}

export function peekDecoded(url: string): AudioBuffer | null {
  return decoded.get(url) ?? null;
}

export function unlockAudioSync() {
  const ctx = context();
  try {
    const tick = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = tick;
    const gain = ctx.createGain();
    gain.gain.value = 0.001;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  } catch {
    /* first frame */
  }
  void ctx.resume();
}

type ScheduledNode = { source: AudioBufferSourceNode; gain: GainNode };
const scheduled: ScheduledNode[] = [];

export function stopScheduledBuffers() {
  const ctx = context();
  if (bedDuck) {
    try {
      bedDuck.gain.cancelScheduledValues(ctx.currentTime);
      bedDuck.gain.setValueAtTime(1, ctx.currentTime);
    } catch {
      /* pad already gone */
    }
  }
  for (const node of scheduled) {
    try {
      node.source.stop();
    } catch {
      /* already stopped */
    }
    try {
      node.source.disconnect();
      node.gain.disconnect();
    } catch {
      /* graph gone */
    }
  }
  scheduled.length = 0;
}

/** Call from a tap. `when` is AudioContext time. */
export function scheduleBufferAt(buffer: AudioBuffer, when: number, volume = 1): void {
  const ctx = context();
  void ctx.resume();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(ctx.destination);
  const startAt = Math.max(when, ctx.currentTime);
  source.start(startAt);
  if (bedDuck) {
    const duck = bedDuck.gain;
    duck.setValueAtTime(0.12, startAt);
    duck.setValueAtTime(1, startAt + Math.max(buffer.duration, 0.2));
  }
  const node: ScheduledNode = { source, gain };
  scheduled.push(node);
  source.onended = () => {
    const i = scheduled.indexOf(node);
    if (i >= 0) scheduled.splice(i, 1);
    try {
      source.disconnect();
      gain.disconnect();
    } catch {
      /* already gone */
    }
  };
}

export function audioNow(): number {
  return context().currentTime;
}

export function stopSample() {
  sampleStop?.();
  sampleStop = null;
}

/** Play a decoded buffer on the unlocked graph. Safe to call from a timer. */
export async function playSample(buffer: AudioBuffer, volume = 0.72): Promise<void> {
  stopSample();
  const ctx = context();
  // start() while suspended is discarded in WebKit — await the mixer, then start.
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  source.connect(gain);
  gain.connect(ctx.destination);
  duckBreathBed(0.32);
  source.start();
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.08);
  const mine = ++sampleGen;
  const lift = () => duckBreathBed(1, 0.55);
  const stop = () => {
    if (sampleStop !== stop) return;
    sampleStop = null;
    lift();
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
    gain.gain.linearRampToValueAtTime(0.0001, t + 0.08);
    window.setTimeout(() => {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      try {
        source.disconnect();
        gain.disconnect();
      } catch {
        /* graph gone */
      }
    }, 120);
  };
  sampleStop = stop;
  source.onended = () => {
    if (sampleGen === mine && sampleStop === stop) {
      sampleStop = null;
      lift();
    }
  };
}

export async function playUrl(url: string, volume = 0.72): Promise<void> {
  const buffer = await decodeUrl(url);
  await playSample(buffer, volume);
}
