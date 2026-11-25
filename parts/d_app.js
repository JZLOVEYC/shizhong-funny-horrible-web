/* =================================================================
   市中 · Shizhong — 交互引擎
   一条 data-d（dread 0→1）的主轴，贯穿配色、文案、噪音、音频与结局。
   ================================================================= */

/* ---------- helpers ---------- */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, f) => {
  const A = hex(a), B = hex(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * f).toString(16).padStart(2, '0')).join('');
};
const root = document.documentElement;
let D = 0, inside = false;

/* ---------- 访问次数（localStorage） ---------- */
let visits = 1;
try {
  visits = (parseInt(localStorage.getItem('shizhong-visits'), 10) || 0) + 1;
  localStorage.setItem('shizhong-visits', String(visits));
} catch (e) {}

/* ---------- 设备识别 ---------- */
const ua = navigator.userAgent || '';
const DEV_KEY = /iPad/.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1) ? 'dev.ipad'
  : /iPhone/.test(ua) ? 'dev.iphone'
  : /Android/.test(ua) ? 'dev.android'
  : /Mac/.test(ua) ? 'dev.mac'
  : /Windows/.test(ua) ? 'dev.windows'
  : /Linux/.test(ua) ? 'dev.linux' : 'dev.screen';

/* ---------- 语言 ---------- */
function detectLang() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'zh' || q === 'en') return q;
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch (e) {}
  const primary = (navigator.languages && navigator.languages[0]) || navigator.language || '';
  return /^zh/i.test(primary) ? 'zh' : 'en';
}
let LANG = detectLang();
const LOCALE = () => LANG === 'zh' ? 'zh-CN' : 'en-US';
const t = k => {
  const cur = DICT[LANG];
  if (cur && cur[k] !== undefined) return cur[k];
  return DICT.zh[k] !== undefined ? DICT.zh[k] : k;
};
const fmt = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => vars[k] !== undefined ? vars[k] : m);

/* 结局与扑屏共用同一张实拍人脸（内嵌 data URI） */

/* ================= 静态文案绑定 ================= */
const langBtn = $('#lang');
const sBtn = $('#sound');
const term = $('#term');
const cnt = $('[data-count]');
let counted = false, swaps = [], logLines = [];

function applyStatic() {
  root.lang = LANG === 'zh' ? 'zh-CN' : 'en';
  $$('[data-i18n]').forEach(el => { el.innerHTML = t(el.dataset.i18n); });
  $$('[data-i18n][data-text]').forEach(el => { el.dataset.text = t(el.dataset.i18n); });
  $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  $$('[data-i18n-value]').forEach(el => { el.value = t(el.dataset.i18nValue); });
  document.title = t('meta.title');
}

function buildSwaps() {
  swaps = $$('[data-swap]').map(el => {
    if (el.dataset.orig === undefined) el.dataset.orig = el.textContent;
    const [th, key] = el.dataset.swap.split(':');
    return { el, t: +th, key, orig: el.dataset.orig };
  });
}

const LOG = [
  ['', 'log.boot'],
  ['', 'log.net'],
  ['', 'log.schedule'],
  ['', 'log.device'],
  ['', 'log.arrive'],
  ['', 'log.study'],
  ['', 'log.living'],
  ['', 'log.bedroom'],
  ['', 'log.screen'],
  ['warn', 'log.expect'],
  ['warn', 'log.detected'],
  ['warn', 'log.recal'],
  ['warn', 'log.detected'],
  ['red', 'log.standing'],
  ['red', 'log.behind'],
  ['red', 'log.lock'],
  ['red big', 'log.hold']
];
function renderLog() {
  term.innerHTML = LOG.map(([c, k]) => `<div class="l ${c}">${fmt(t(k), { dev: t(DEV_KEY) })}</div>`).join('') +
    '<span class="cursor"></span>';
  logLines = $$('#term .l');
}

/* ================= 动态文案 ================= */
function paintSitStill() {
  $('#letsit').textContent = t('letsit.chunk').repeat(LANG === 'zh' ? 900 : 1000);
}

function jitterFaq() {
  $$('.jit').forEach(el => {
    const s = el.textContent;
    if (!s) return;
    el.innerHTML = [...s].map((c, i) => {
      const k = i / s.length;
      return `<span style="transform:translateY(${(Math.random() - .5) * 4 * k}px) rotate(${(Math.random() - .5) * 6 * (k + .2)}deg)">${c}</span>`;
    }).join('');
  });
}

function refreshMistakes() {
  const now = new Date();
  const time = now.toLocaleTimeString(LOCALE(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  $('#mkDevice').textContent = fmt(t('mk.m3'), { dev: t(DEV_KEY) });
  $('#mkTime').textContent = fmt(t('mk.m4'), { time });
  $('#mkVisit').textContent = fmt(t('mk.m5'), { n: visits });
}

let lastMinute = -1;
function refreshDynamic() {
  refreshMistakes();
  $('#device').textContent = fmt(t('stats.aside'), { dev: t(DEV_KEY) });
  paintSitStill();
  syncSoundLabel();
  tick();
  jitterFaq();
  if (counted) cnt.textContent = t('count.suffix');
  if (inside) applyScareText();
}

function syncSoundLabel() {
  if (soundFailed) sBtn.textContent = t('sound.unavailable');
  else sBtn.textContent = audio ? t('sound.on') : t('sound.off');
  const h = $('#heroSound');
  if (h) h.textContent = audio ? t('sound.heroOn') : t('sound.heroOff');
}

function syncLangBtn() {
  langBtn.textContent = LANG === 'zh' ? 'EN' : '中文';
  langBtn.title = LANG === 'zh' ? 'Switch to English' : '切换到中文';
  langBtn.setAttribute('aria-label', langBtn.title);
}

function applyLang() {
  applyStatic();
  buildSwaps();
  renderLog();
  refreshDynamic();
  updateCam();
  frame();
}

function setLang(l, persist) {
  LANG = l === 'zh' ? 'zh' : 'en';
  if (persist) { try { localStorage.setItem(STORE_KEY, LANG); } catch (e) {} }
  syncLangBtn();
  applyLang();
}

/* ================= 眼睛 ================= */
const stage = $('#eyeStage'), eyes = [];
for (let i = 0; i < 46; i++) {
  const e = document.createElement('div');
  e.className = 'eye';
  e.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 100}%;--w:${40 + Math.random() * 110}px;--r:${(Math.random() - .5) * 30}deg`;
  e.innerHTML = '<i></i>';
  stage.appendChild(e);
  eyes.push({ el: e, thr: Math.random() * .6, blink: 0 });
}
let mx = innerWidth / 2, my = innerHeight / 2;
addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; poke(); }, { passive: true });

function updateEyes(prog) {
  eyes.forEach(o => {
    let open = clamp((prog - o.thr) * 4);
    if (o.blink > 0) { open *= .05; o.blink--; } else if (Math.random() < .002) o.blink = 6;
    o.el.style.setProperty('--o', open.toFixed(3));
    if (open > .08) {
      const r = o.el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const a = Math.atan2(my - cy, mx - cx), d = Math.min(1, Math.hypot(mx - cx, my - cy) / 300);
      o.el.style.setProperty('--x', (Math.cos(a) * r.width * .22 * d) + 'px');
      o.el.style.setProperty('--y', (Math.sin(a) * r.height * .18 * d) + 'px');
    }
  });
}

/* ================= 学情看板 ================= */
let camVisits = 0, camSeen = false;
new IntersectionObserver(([e]) => { if (e.isIntersecting) camVisits++; }, { threshold: .35 }).observe($('.cctv'));

function updateCam() {
  const box = $('.cctv').getBoundingClientRect(), vh = innerHeight;
  const prog = clamp((vh - box.top) / (vh + box.height));
  const base = Math.max(0, camVisits - 1) * .3;
  const visible = camVisits > 1 || prog > .42;
  const c = clamp(base + Math.max(0, prog - .35) * 1.2, 0, 1);
  const fig = $('#fig');
  fig.setAttribute('opacity', visible ? (camVisits > 1 ? 1 : .92) : 0);
  fig.setAttribute('transform', `translate(${1100 - c * 300} ${290 + c * 90}) scale(${.9 + c * 2.6})`);
  $('#motion').style.opacity = visible ? 1 : 0;
  if (visible && !camSeen) {
    camSeen = true;
    const st = $('#static');
    st.style.opacity = .7;
    setTimeout(() => { st.style.opacity = 0; }, 130);
  }
  $('#camlabel').textContent = camVisits > 1 ? t('cam.labelYours') : t('cam.label');
  $('#camcap').textContent = camVisits > 1 ? t('cam.capNotDemo') : (visible ? t('cam.capMotion') : t('cam.cap'));
}

/* ================= 滚动引擎 ================= */
const secs = $$('[data-bg]');
const TITLES = [[0, 'title.a'], [.3, 'title.b'], [.44, 'title.c'], [.6, 'title.d'], [.78, 'title.e'], [.86, 'title.f']];
const noiseEl = $('#noise'), vig = $('#vig'), scan = $('#scan');
let ticking = false;

const sticky = id => {
  const s = $(id), d = s.offsetHeight - innerHeight;
  if (d <= 0) return scrollY >= s.offsetTop ? 1 : 0;
  return clamp((scrollY - s.offsetTop) / d);
};

function frame() {
  ticking = false;
  const vh = innerHeight, mid = scrollY + vh * .5;
  let i = secs.findIndex(s => s.offsetTop + s.offsetHeight > mid);
  if (i < 0) i = secs.length - 1;
  const s = secs[i], n = secs[Math.min(i + 1, secs.length - 1)];
  const p = clamp((((mid - s.offsetTop) / s.offsetHeight) - .55) / .45);

  D = +s.dataset.d + (+n.dataset.d - +s.dataset.d) * p;
  const bgNow = mix(s.dataset.bg, n.dataset.bg, p);
  const fgNow = mix(s.dataset.fg, n.dataset.fg, p);
  const acNow = mix(s.dataset.ac, n.dataset.ac, p);
  root.style.setProperty('--bg', bgNow);
  root.style.setProperty('--fg', fgNow);
  root.style.setProperty('--accent', acNow);
  /* 卡片也跟着恐惧值变暗，避免深色章节里糊成一片 */
  root.style.setProperty('--card', mix(bgNow, '#ffffff', .3 - .24 * D));
  root.style.setProperty('--d', D.toFixed(3));

  const floor = inside ? .12 : 0;
  noiseEl.style.opacity = Math.max(floor, clamp((D - .42) * .42, 0, .2));
  vig.style.opacity = Math.max(floor * 2, clamp((D - .3) * 1.2));
  scan.style.opacity = clamp((D - .72) * 1.1, 0, .34);

  swaps.forEach(o => {
    const w = D > o.t ? t(o.key) : o.orig;
    if (o.el.textContent !== w) o.el.textContent = w;
  });

  let tt = t(TITLES[0][1]);
  TITLES.forEach(([th, k]) => { if (D >= th) tt = t(k); });
  if (!document.hidden && document.title !== tt) document.title = tt;

  $('#pricingAside').style.opacity = D > .5 ? 1 : 0;

  updateCam();

  const lp = sticky('#log');
  const shown = Math.floor(lp * 1.25 * logLines.length);
  logLines.forEach((l, k) => l.classList.toggle('on', k < shown));

  const ep = sticky('#eyes');
  if (ep > 0 && ep < 1) updateEyes(ep);
  $$('.eyetext p').forEach((el, k) => el.classList.toggle('on', ep > .22 + k * .2));
  $('#letsit').style.opacity = clamp((ep - .3) * 1.2, 0, .55);

  const np = sticky('#end');
  const face = $('#face'), faceImg = $('#faceImg');
  face.classList.toggle('on', !inside && np > .01);
  face.style.opacity = inside ? 0 : clamp(np * 1.2, 0, .55);
  if (faceImg) faceImg.style.transform = `scale(${.8 + np * .35})`;
  face.style.filter = `blur(${Math.max(0, 2.6 - np * 2.6).toFixed(2)}px) contrast(1.06)`;
  $('#endtext').style.opacity = inside ? 0 : clamp(1 - np * 1.6);
  if (np > .72 && !inside) jumpscare();

  updateAudio();
}
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } poke(); }, { passive: true });
addEventListener('resize', frame);

/* 抽搐：随恐惧增长 */
setInterval(() => {
  if (D < .15) return;
  const all = $$('.twitch'), el = all[Math.floor(Math.random() * all.length)];
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (r.bottom < 0 || r.top > innerHeight) return;
  if (Math.random() < D * .8) {
    const k = D * D * 10, base = el.style.transform;
    el.style.transform = `translate(${(Math.random() - .5) * k}px,${(Math.random() - .5) * k}px) skewX(${(Math.random() - .5) * k * .6}deg)`;
    setTimeout(() => { el.style.transform = base; }, 60 + Math.random() * 120);
  }
}, 130);

/* 噪点 */
const nctx = noiseEl.getContext('2d'), img = nctx.createImageData(320, 180);
setInterval(() => {
  if (+noiseEl.style.opacity < .01) return;
  for (let k = 0; k < img.data.length; k += 4) {
    const v = Math.random() * 255;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = v;
    img.data[k + 3] = 255;
  }
  nctx.putImageData(img, 0, 0);
}, 55);

/* ================= 小动作：时钟、计时、专注度、错题时间 ================= */
const t0 = Date.now();
let focus = 98, lastAct = Date.now();
function activity() { lastAct = Date.now(); }
addEventListener('scroll', activity, { passive: true });
addEventListener('pointermove', activity, { passive: true });
addEventListener('keydown', activity);

function tick() {
  const now = new Date();
  const tstr = now.toLocaleTimeString(LOCALE(), { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  $('#clock').textContent = tstr;
  $('#camtime').textContent = now.toISOString().slice(0, 10) + '  ' + now.toLocaleTimeString(LOCALE(), { hourCycle: 'h23' });
  const el = Math.floor((Date.now() - t0) / 1000);
  $('#session').textContent = String(Math.floor(el / 60)).padStart(2, '0') + ':' + String(el % 60).padStart(2, '0');
  if (now.getMinutes() !== lastMinute) {
    lastMinute = now.getMinutes();
    refreshMistakes();
  }
}
setInterval(tick, 1000);

setInterval(() => {
  const idle = (Date.now() - lastAct) / 1000;
  const target = idle > 4 ? Math.max(72, 98 - (idle - 4) * 3) : 98;
  focus += (target - focus) * .18;
  const fv = $('#focusVal');
  if (fv) fv.textContent = Math.round(focus) + '%';
}, 700);

/* 数字动画 */
const statObserver = new IntersectionObserver(([e]) => {
  if (e.isIntersecting && !counted) {
    counted = true;
    const goal = +cnt.dataset.count, st = performance.now();
    (function step(now) {
      const k = clamp((now - st) / 1600);
      cnt.textContent = Math.floor(goal * (1 - Math.pow(1 - k, 3))).toLocaleString(LOCALE());
      if (k < 1) requestAnimationFrame(step);
      else cnt.textContent = t('count.suffix');
    })(st);
  }
});
statObserver.observe(cnt);

/* 表单 / 按钮 */
const fb = $('#foreverBtn');
fb.addEventListener('mouseenter', () => { fb.textContent = t('price.p3hover'); });
fb.addEventListener('mouseleave', () => { fb.textContent = t('price.p3cta'); });

$('#form').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('#msg').value.trim();
  $('#formmsg').textContent = v ? t('form.ok') : t('form.empty');
  startAudio();
});

$('#quitBtn').addEventListener('click', () => toast(t('footer.quitToast')));

$('#analysisBtn').addEventListener('click', () => {
  const a = $('#analysis');
  a.classList.toggle('on');
  $('#analysisBtn').textContent = a.classList.contains('on') ? t('mk.ctaOn') : t('mk.cta');
});

/* toast / 切页 / 暗示 */
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(el._h);
  el._h = setTimeout(() => el.classList.remove('on'), 3800);
}

let leftAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    leftAt = Date.now();
    if (D > .4 || inside) document.title = t('title.hidden');
  } else {
    frame();
    if ((D > .4 || inside) && Date.now() - leftAt > 1500) {
      toast(fmt(t('toast.back'), { s: Math.round((Date.now() - leftAt) / 1000) }));
    }
  }
});

let idleT, wi = 0;
const WHISPERS = ['whisper.w1', 'whisper.w2', 'whisper.w3', 'whisper.w4', 'whisper.w5'];
function poke() {
  $('#whisper').classList.remove('on');
  clearTimeout(idleT);
  idleT = setTimeout(() => {
    if (D > .55 && !$('#scare').classList.contains('on')) {
      const w = $('#whisper');
      w.textContent = t(WHISPERS[wi++ % WHISPERS.length]);
      w.classList.add('on');
      if (audio) whisperSound();
    }
  }, 6500);
}

/* ================= 惊吓 ================= */
function applyScareText() {
  $('#h1').innerHTML = t('scare.h1');
  $('#lead').textContent = t('scare.lead');
  $('#people').textContent = '2';
  $('#trusted').textContent = t('scare.trusted');
}

function jumpscare() {
  inside = true;
  const sc = $('#scare');
  sc.classList.add('on');
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) document.body.classList.add('shake');
  scream();
  setTimeout(() => {
    sc.classList.remove('on');
    document.body.classList.remove('shake');
    $('#inside').style.opacity = 1;
    applyScareText();
    frame();
  }, 950);
}

/* ================= 音频：音乐盒 + 节拍器 + 低频 ================= */
let AC = null, audio = false, soundFailed = false, master = null;
let bellBus = null, droneG = null, noiseG = null, nbuf = null, musicTimer = null;

const SCALE = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];
const MELODY = [0, 2, 4, 3, 1, 2, 5, 4, 2, 0, 3, 1];

function startAudio() {
  if (audio) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.resume) AC.resume();
    master = AC.createGain(); master.gain.value = .55; master.connect(AC.destination);
    bellBus = AC.createGain(); bellBus.gain.value = .9; bellBus.connect(master);

    droneG = AC.createGain(); droneG.gain.value = 0;
    const dl = AC.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 170;
    [55, 58.3, 82.4].forEach(f => {
      const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      o.connect(dl); o.start();
    });
    dl.connect(droneG); droneG.connect(master);

    nbuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
    const ch = nbuf.getChannelData(0);
    for (let k = 0; k < ch.length; k++) ch[k] = Math.random() * 2 - 1;

    noiseG = AC.createGain(); noiseG.gain.value = 0;
    const ns = AC.createBufferSource(); ns.buffer = nbuf; ns.loop = true;
    const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = .6;
    ns.connect(bp); bp.connect(noiseG); noiseG.connect(master); ns.start();

    audio = true; soundFailed = false;
    syncSoundLabel();
    updateAudio();
    startMusic();
  } catch (e) {
    audio = false; soundFailed = true; syncSoundLabel();
  }
}

function stopAudio() {
  if (!audio) return;
  clearInterval(musicTimer); musicTimer = null;
  try { AC.close(); } catch (e) {}
  audio = false; AC = null;
  syncSoundLabel();
}

sBtn.addEventListener('click', () => audio ? stopAudio() : startAudio());
$('#heroSound').addEventListener('click', startAudio);

function bell(f, at, dur = 1.7) {
  const o = AC.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f, at);
  const o2 = AC.createOscillator(); o2.type = 'sine'; o2.frequency.setValueAtTime(f * 2.01, at);
  const g = AC.createGain();
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(.15, at + .012);
  g.gain.exponentialRampToValueAtTime(.001, at + dur);
  const g2 = AC.createGain();
  g2.gain.setValueAtTime(0, at); g2.gain.linearRampToValueAtTime(.04, at + .012);
  g2.gain.exponentialRampToValueAtTime(.001, at + dur * .5);
  o.connect(g); o2.connect(g2); g.connect(bellBus); g2.connect(bellBus);
  o.start(at); o.stop(at + dur); o2.start(at); o2.stop(at + dur);
}

function tickSound(at, up) {
  const o = AC.createOscillator(); o.type = 'square'; o.frequency.value = up ? 1400 : 1080;
  const g = AC.createGain();
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(.032, at + .004);
  g.gain.exponentialRampToValueAtTime(.0008, at + .06);
  o.connect(g); g.connect(master); o.start(at); o.stop(at + .08);
}

let beat = 0;
function startMusic() {
  clearInterval(musicTimer);
  beat = 0;
  musicTimer = setInterval(() => {
    if (!audio || !AC) return;
    const now = AC.currentTime;
    tickSound(now, beat % 2 === 0);
    if (beat % 2 === 0) {
      const idx = Math.floor(beat / 2) % MELODY.length;
      const detune = Math.pow(2, (Math.random() - .5) * D * .05);
      bell(SCALE[MELODY[idx]] * detune, now);
    }
    if (D > .7 && Math.random() < D * .35) tickSound(now + .27, Math.random() < .5);
    beat++;
  }, 1000);
}

function updateAudio() {
  if (!audio || !AC) return;
  const now = AC.currentTime, p = D;
  if (droneG) droneG.gain.setTargetAtTime(Math.pow(clamp((p - .25) / .75), 1.5) * .2, now, .8);
  if (noiseG) noiseG.gain.setTargetAtTime(clamp(p - .5) * .08, now, .8);
}

function thump(at, v) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(70, at);
  o.frequency.exponentialRampToValueAtTime(38, at + .18);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(v, at + .012);
  g.gain.exponentialRampToValueAtTime(.001, at + .26);
  o.connect(g); g.connect(master); o.start(at); o.stop(at + .3);
}
setInterval(() => {
  if (audio && AC && D > .84) {
    const now = AC.currentTime, v = inside ? .3 : .14 + D * .16;
    thump(now, v); thump(now + .22, v * .7);
  }
}, 900);

function whisperSound() {
  if (!audio || !AC || !nbuf) return;
  const src = AC.createBufferSource(); src.buffer = nbuf;
  const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 3;
  const g = AC.createGain(), at = AC.currentTime;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(.1, at + .4);
  g.gain.linearRampToValueAtTime(0, at + 1.6);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(at); src.stop(at + 1.7);
}

function scream() {
  if (!audio || !AC) return;
  const at = AC.currentTime;
  const ws = AC.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let k = 0; k < 1024; k++) curve[k] = Math.tanh((k / 512 - 1) * 14);
  ws.curve = curve;
  const g = AC.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(.5, at + .02);
  g.gain.exponentialRampToValueAtTime(.001, at + 1.6);
  ws.connect(g); g.connect(master);
  [587, 622, 880, 1244].forEach(f => {
    const o = AC.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, at);
    o.frequency.exponentialRampToValueAtTime(f * .45, at + 1.4);
    o.connect(ws); o.start(at); o.stop(at + 1.6);
  });
  const n = AC.createBufferSource(); n.buffer = nbuf;
  const ng = AC.createGain();
  ng.gain.setValueAtTime(.55, at);
  ng.gain.exponentialRampToValueAtTime(.001, at + 1.2);
  n.connect(ng); ng.connect(master); n.start(at); n.stop(at + 1.3);
}

/* ================= LOGO: 市 → 逝 ================= */
const logoShi = document.getElementById('logoShi');
let shiGone = false;

function logoGlitch() {
  if (!logoShi) return;
  /* 结局之后不再回来 */
  if (inside) {
    if (!shiGone) {
      logoShi.textContent = '逝';
      logoShi.classList.add('gone');
      shiGone = true;
    }
    return;
  }
  /* 雪花点一出现（D>0.42）才开始闪 */
  const s = clamp((D - .42) * 1.7);
  if (s <= 0) {
    if (shiGone) {
      logoShi.textContent = '市';
      logoShi.classList.remove('gone');
      shiGone = false;
    }
    return;
  }
  if (shiGone) {
    if (Math.random() < .62) {
      logoShi.textContent = '市';
      logoShi.classList.remove('gone');
      shiGone = false;
    }
  } else if (Math.random() < s * .22) {
    logoShi.textContent = '逝';
    logoShi.classList.add('gone');
    shiGone = true;
  }
}
setInterval(logoGlitch, 150);

/* ================= BOOT ================= */
(function checkDict() {
  const miss = Object.keys(DICT.zh).filter(k => DICT.en[k] === undefined)
    .concat(Object.keys(DICT.en).filter(k => DICT.zh[k] === undefined));
  if (miss.length) console.warn('[i18n] 键位不一致：', miss);
})();

langBtn.addEventListener('click', () => setLang(LANG === 'zh' ? 'en' : 'zh', true));

syncLangBtn();
applyLang();
