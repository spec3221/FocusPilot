// Аудио-движок микшера: все звуки синтезируются через Web Audio API (файлы не нужны).
const ctx = new AudioContext();
const master = ctx.createGain();
master.gain.value = 0;
master.connect(ctx.destination);

const LOOP_SECONDS = 6;

function makeBuffer(type) {
  const len = Math.floor(ctx.sampleRate * LOOP_SECONDS);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let last = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === "white") {
        d[i] = w;
      } else if (type === "brown") {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    // короткое затухание на краях, чтобы в месте зацикливания не было щелчка
    const f = 96;
    for (let i = 0; i < f; i++) {
      const k = i / f;
      d[i] *= k;
      d[len - 1 - i] *= k;
    }
  }
  return buf;
}

const buffers = { white: makeBuffer("white"), pink: makeBuffer("pink"), brown: makeBuffer("brown") };

function loopSource(buf) {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.start(0, Math.random() * buf.duration);
  return s;
}

function filter(type, freq, q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function gainNode(v) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

function lfo(freq, depth, param) {
  const o = ctx.createOscillator();
  o.frequency.value = freq;
  const d = gainNode(depth);
  o.connect(d);
  d.connect(param);
  o.start();
}

function chain(...nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
}

function channelOut() {
  const g = gainNode(0);
  g.connect(master);
  return g;
}

const channels = {};

// Дождь: высокочастотный шум + мягкая «подложка»
(() => {
  const out = channelOut();
  chain(loopSource(buffers.white), filter("highpass", 900), filter("lowpass", 9000), gainNode(0.35), out);
  chain(loopSource(buffers.pink), filter("lowpass", 1800), gainNode(0.35), out);
  channels.rain = { out };
})();

// Волны: тёмный шум с медленной «приливной» огибающей
(() => {
  const out = channelOut();
  const swell = gainNode(0.55);
  lfo(0.11, 0.45, swell.gain);
  chain(loopSource(buffers.brown), filter("lowpass", 700), swell, out);
  channels.waves = { out };
})();

// Ветер: полосовой шум, у которого «плавает» частота и громкость
(() => {
  const out = channelOut();
  const bp = filter("bandpass", 450, 0.8);
  lfo(0.08, 220, bp.frequency);
  const gust = gainNode(0.9);
  lfo(0.05, 0.4, gust.gain);
  chain(loopSource(buffers.pink), bp, gust, out);
  channels.wind = { out };
})();

// Костёр: низкий гул + случайные потрескивания
(() => {
  const out = channelOut();
  chain(loopSource(buffers.brown), filter("lowpass", 500), gainNode(0.6), out);
  channels.fire = { out, level: 0, timer: null };
})();

function pop() {
  const t = ctx.currentTime;
  const s = ctx.createBufferSource();
  s.buffer = buffers.white;
  const hp = filter("highpass", 1200 + Math.random() * 2500);
  const g = gainNode(0.15 + Math.random() * 0.5);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.02 + Math.random() * 0.05);
  chain(s, hp, g, channels.fire.out);
  s.start(t, Math.random() * 4, 0.12);
}

function scheduleCrackle() {
  const fire = channels.fire;
  clearTimeout(fire.timer);
  if (fire.level <= 0.01) return;
  fire.timer = setTimeout(() => { pop(); scheduleCrackle(); }, 40 + Math.random() * 350);
}

// Глубокий (коричневый) и белый шум
(() => {
  const out = channelOut();
  chain(loopSource(buffers.brown), filter("lowpass", 1500), gainNode(0.9), out);
  channels.brown = { out };
})();
(() => {
  const out = channelOut();
  chain(loopSource(buffers.white), filter("lowpass", 14000), gainNode(0.3), out);
  channels.white = { out };
})();

function apply(state) {
  if (!state) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(Math.min(1, Math.max(0, Number(state.master) || 0)), t, 0.05);
  for (const [key, ch] of Object.entries(channels)) {
    const v = Math.min(1, Math.max(0, Number(state.levels?.[key]) || 0));
    ch.out.gain.setTargetAtTime(v * v, t, 0.08); // квадратичная кривая — тонкая регулировка на тихих уровнях
    if (key === "fire") {
      const was = ch.level;
      ch.level = v;
      if (was <= 0.01 && v > 0.01) scheduleCrackle();
    }
  }
}

chrome.runtime.onMessage.addListener(msg => {
  if (msg?.target !== "offscreen") return;
  if (msg.type === "mixerApply") apply(msg.state);
});

ctx.resume().catch(() => {});
chrome.runtime.sendMessage({ type: "mixerReady" })
  .then(r => { if (r?.state) apply(r.state); })
  .catch(() => {});
