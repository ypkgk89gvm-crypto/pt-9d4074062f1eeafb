const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs');
const URL = process.argv[2] || 'http://localhost:8772/'; const tag = URL.includes('github.io') ? 'live' : 'local';
const srv = http.createServer((q, r) => { if (q.method==='POST'){q.resume();q.on('end',()=>r.end('{}'));return;} if (q.url.startsWith('/log')) { r.setHeader('access-control-allow-origin','*'); return r.end('{"ok":true}'); }
  if (q.url.startsWith('/dad-celebrate.gif')) { r.setHeader('content-type','image/gif'); return r.end(fs.readFileSync('/workspace/practice-timer/dad-celebrate.gif')); }
  r.setHeader('content-type','text/html'); r.end(fs.readFileSync('/workspace/practice-timer/index.html')); }).listen(8772);
const sleep = ms => new Promise(r => setTimeout(r, ms)); const R = []; const ok = (n, c, x) => R.push((c ? 'PASS ' : 'FAIL ') + n + (x ? ' ' + JSON.stringify(x) : ''));
const secs = t => { const [m, s] = t.split(':').map(Number); return m * 60 + s; };
async function open(wav, qs, w = 1024, h = 768) {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture=/tmp/jstest/' + wav,'--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.setUserAgent('Mozilla/5.0 (iPad; CPU OS 12_5_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1');
  await p.evaluateOnNewDocument(() => { delete window.PointerEvent; if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) window.__realGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); });
  await p.setRequestInterception(true); p.on('request', r => (r.method()==='POST'||r.url().includes('script.google.com')) ? r.abort() : r.continue());
  await p.setViewport({ width: w, height: h, hasTouch: true, isMobile: true });
  await p.goto(URL + (qs || '') , { waitUntil: 'networkidle2' });
  await p.evaluate(() => { window.__realGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); window.__seen = []; setInterval(() => { const w = window.__wpt.mic.why; if (w && window.__seen[window.__seen.length - 1] !== w) window.__seen.push(w); }, 50); });
  return { b, p };
}
const st = p => p.evaluate(() => { const a = window.__wpt.getAudio(); return { screen: document.querySelector('.screen.on').id, clock: document.getElementById('clock').textContent, status: document.getElementById('status').textContent,
  ctx: a ? a.ctx.state : null, rec: window.__wpt.mic.recoveries, why: window.__wpt.mic.why, fix: document.getElementById('micFix').style.display !== 'none' }; });
(async () => {
  let { b, p } = await open('play.wav', '?v=1');
  await p.evaluate(() => localStorage.setItem('wpt.logUrl', JSON.stringify('http://localhost:8772/log')));
  await p.tap('.kid:nth-child(1)'); await p.tap('#startBtn'); await sleep(5000);
  let s0 = await st(p); ok('practice running', s0.screen === 'practice' && s0.ctx === 'running', s0);
  // 1. track ended
  await p.evaluate(() => window.__wpt.getAudio().stream.getTracks()[0].stop()); await sleep(800);
  let s1a = await st(p); await sleep(5000); let s1 = await st(p); await sleep(3000); let s1b = await st(p);
  ok('track ended -> mic rebuilt, clock keeps counting', (await p.evaluate(() => window.__seen.includes('ended'))) && s1.rec >= 1 && s1.ctx === 'running' && !s1.why && secs(s1b.clock) < secs(s1.clock), [s1a.why, s1, s1b.clock]);
  // 2. suspended context
  await p.evaluate(() => window.__wpt.getAudio().ctx.suspend()); await sleep(500); let s2a = await st(p); await sleep(3500); let s2 = await st(p);
  ok('suspended sound engine -> resumed', (await p.evaluate(() => window.__seen.includes('suspended'))) && s2.rec === s1.rec && s2.ctx === 'running' && !s2.why, [s2a, s2]);
  // 3. analyser stuck at zero
  const r3 = s2.rec;
  await p.evaluate(() => { const a = window.__wpt.getAudio(); a.analyser.getFloatTimeDomainData = function (b) { b.fill(0); }; });
  await sleep(5000); let s3a = await st(p); await sleep(4000); let s3 = await st(p); await sleep(3000); let s3b = await st(p);
  ok('flat-zero signal -> mic rebuilt', (await p.evaluate(() => window.__seen.includes('zero'))) && s3.rec > r3 && !s3.why && secs(s3b.clock) < secs(s3.clock), [s3a.why, s3, s3b.clock]);
  // 4. visibility hidden -> visible
  await p.evaluate(() => { window.__vis = 'hidden'; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__vis }); document.dispatchEvent(new Event('visibilitychange')); window.__wpt.getAudio().ctx.suspend(); });
  await sleep(500); let h1 = await st(p); await sleep(3000); let h2 = await st(p);
  ok('hidden: no counting, no rebuild', h1.why === 'hidden' && h1.clock === h2.clock && h2.rec === s3.rec, [h1, h2]);
  await p.evaluate(() => { window.__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); }); await sleep(1500); let h3 = await st(p);
  ok('visible again -> sound engine resumed right away', h3.ctx === 'running' && !h3.why, h3);
  // 5. Safari refuses until a tap: prompt + tap fixes it
  await p.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('needs gesture')); window.__wpt.getAudio().stream.getTracks()[0].stop(); });
  await sleep(9000); let t1 = await st(p);
  await p.screenshot({ path: `/workspace/kiddos-shots/timer/20-mic-${tag}-tap-prompt-landscape.png` });
  ok('mic cannot come back -> "Tap to turn the mic back on" shown', t1.fix && /mic/i.test(t1.status), t1);
  await p.setViewport({ width: 768, height: 1024, hasTouch: true, isMobile: true }); await sleep(500);
  await p.screenshot({ path: `/workspace/kiddos-shots/timer/20-mic-${tag}-tap-prompt-portrait.png` });
  await p.evaluate(() => { navigator.mediaDevices.getUserMedia = window.__realGUM; }); await p.tap('#micFix'); await sleep(2500); let t2 = await st(p);
  ok('tap -> mic back, prompt hidden', !t2.fix && t2.ctx === 'running' && !t2.why, t2);
  ok('no page errors (A)', !p.errs.length, p.errs);
  await b.close();
  // B: dead mic must NOT trigger the silence auto-end; real silence still does
  ({ b, p } = await open('quiet.wav', '?quietEnd=10'));
  await p.tap('.kid:nth-child(3)'); await p.tap('#startBtn'); await sleep(2000);
  await p.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('dead')); window.__wpt.getAudio().stream.getTracks()[0].stop(); });
  await sleep(16000); let d1 = await st(p);
  ok('dead mic for 16 s (quiet limit 10 s): NOT auto-ended', d1.screen === 'practice' && d1.fix, d1);
  await p.evaluate(() => { navigator.mediaDevices.getUserMedia = window.__realGUM; }); await p.tap('#micFix');
  let d2; for (let i = 0; i < 20; i++) { await sleep(1000); d2 = await st(p); if (d2.screen === 'pick') break; }
  const toastTxt = await p.$eval('#toast', e => e.textContent);
  ok('mic fixed + real silence -> auto-ends after the quiet limit', d2.screen === 'pick' && /No sound/.test(toastTxt), [d2.screen, toastTxt]);
  ok('no page errors (B)', !p.errs.length, p.errs);
  await b.close();
  // C: safe auto reload
  ({ b, p } = await open('play.wav', '?reloadIdleMin=0.05'));
  await p.evaluate(() => { const w = window.__wpt; w.store.set('day.' + w.dayOf(), { 'Eden|Piano': 120 }); window.__marker = 1; });
  await sleep(7000);
  let c1 = await p.evaluate(() => ({ marker: window.__marker || 0, eden: window.__wpt.doneToday(window.__wpt.KIDS[2]), reloadedAt: window.__wpt.store.get('reloadedAt', 0) }));
  ok('idle on home -> page reloaded, today\'s time kept', !c1.marker && c1.eden === 120 && c1.reloadedAt > 0, c1);
  await p.evaluate(() => { window.__marker = 2; }); await p.tap('.kid:nth-child(1)'); await p.tap('#startBtn'); await sleep(7000);
  let c2 = await p.evaluate(() => ({ marker: window.__marker || 0, screen: document.querySelector('.screen.on').id }));
  ok('never reloads during practice', c2.marker === 2 && c2.screen === 'practice', c2);
  await p.tap('#pauseBtn'); await sleep(5000);
  ok('never reloads while paused', await p.evaluate(() => window.__marker === 2));
  ok('no page errors (C)', !p.errs.length, p.errs);
  await b.close(); srv.close();
  console.log(R.join('\n'));
})().catch(e => { console.error(e); process.exit(1); });
