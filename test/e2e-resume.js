// Browser test for pause / End / resume-today / quiet auto-end. Needs Chrome + puppeteer-core and play.wav / quiet.wav in WAV_DIR.
// Run: NODE_PATH=/tmp/jstest/node_modules WAV_DIR=/tmp/jstest node test/e2e-resume.js  (screenshots go to SHOTS)
const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs');
const SHOTS = '/workspace/kiddos-shots/timer/'; const PROFILE = '/tmp/pt-profile';
fs.rmSync(PROFILE, { recursive: true, force: true }); fs.writeFileSync('posted.jsonl', '');
const srv = http.createServer((q, r) => {
  if (q.method === 'POST') { let b = ''; q.on('data', d => b += d); q.on('end', () => { fs.appendFileSync('posted.jsonl', b + '\n'); r.end('{}'); }); return; }
  if (q.url.startsWith('/log')) { r.setHeader('content-type', 'application/json'); r.setHeader('access-control-allow-origin', '*'); return r.end(JSON.stringify({ ok: true, app: 'Wagner Practice Log', version: 2 })); }
  if (q.url.startsWith('/celebrate.mp4')) { r.statusCode = 404; return r.end(); }
  r.setHeader('content-type', 'text/html'); r.end(fs.readFileSync('' + require('path').join(__dirname, '..', 'index.html') + ''));
}).listen(8766);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function open(wav, qs, opts = {}) {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', userDataDir: PROFILE,
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=/tmp/jstest/' + wav, '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); await p.setViewport({ width: 1180, height: 820 });
  p.errs = []; p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
  if (opts.dayShift) await p.evaluateOnNewDocument(sh => { const D = Date, off = sh * 864e5; function N(...a) { return a.length ? new D(...a) : new D(D.now() + off); } N.prototype = D.prototype; N.now = () => D.now() + off; N.UTC = D.UTC; N.parse = D.parse; window.Date = N; }, opts.dayShift);
  await p.goto('http://localhost:8766/' + (qs || ''), { waitUntil: 'networkidle2' });
  return { b, p };
}
const st = p => p.evaluate(() => ({ screen: document.querySelector('.screen.on').id, clock: document.getElementById('clock').textContent, status: document.getElementById('status').textContent,
  pauseBtn: document.getElementById('pauseBtn').textContent, toast: document.getElementById('toast').textContent, warn: document.getElementById('quietWarn').textContent,
  eden: window.__wpt.doneToday(window.__wpt.KIDS[2]), cards: [...document.querySelectorAll('.kid')].map(k => k.innerText.replace(/\n/g, ' ')) }));
const R = []; const ok = (name, c, x) => { R.push((c ? 'PASS ' : 'FAIL ') + name + (x ? '  ' + JSON.stringify(x) : '')); };
const secs = t => { const [m, s] = t.split(':').map(Number); return m * 60 + s; };
(async () => {
  // ---- Run A: play, pause/resume, End, resume, then kill the browser mid-session
  let { b, p } = await open('play.wav');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('wpt.logUrl', JSON.stringify('http://localhost:8766/log')); }); await p.reload({ waitUntil: 'networkidle2' });
  ok('default quiet auto-end is 3 min', await p.evaluate(() => window.__wpt.QUIET_END_MS) === 180000);
  await p.screenshot({ path: SHOTS + '01-pick.png' });
  await p.click('.kid:nth-child(3)'); await p.screenshot({ path: SHOTS + '02-ready.png' });
  await p.click('#startBtn'); await sleep(11000);
  let s1 = await st(p); await p.screenshot({ path: SHOTS + '03-playing.png' });
  ok('clock runs while playing', secs(s1.clock) <= 20 * 60 - 6, s1);
  // Pause using the keyboard (remote-style focus + Enter)
  await p.focus('#pauseBtn'); await p.keyboard.press('Enter'); await sleep(500);
  let s2 = await st(p); await sleep(5000); let s3 = await st(p); await p.screenshot({ path: SHOTS + '04-paused.png' });
  ok('pause freezes clock (sound still playing)', s2.clock === s3.clock && /Resume/.test(s3.pauseBtn) && /Paused/.test(s3.status), [s2.clock, s3.clock, s3.status]);
  await p.click('#pauseBtn'); await sleep(6000); let s4 = await st(p);
  ok('resume restarts clock', secs(s4.clock) < secs(s3.clock), [s3.clock, s4.clock]);
  await p.click('#doneBtn'); await sleep(800); let s5 = await st(p); await p.screenshot({ path: SHOTS + '05-ended-home.png' });
  ok('End saves and returns home', s5.screen === 'pick' && /Saved!/.test(s5.toast) && s5.eden > 5, s5);
  const endedRemain = 20 * 60 - s5.eden;
  await p.click('.kid:nth-child(3)'); await sleep(300);
  let rd = await p.evaluate(() => ({ clock: document.getElementById('readyClock').textContent, btn: document.getElementById('startBtn').textContent }));
  await p.screenshot({ path: SHOTS + '06-ready-resume.png' });
  ok('restart offers resume at saved time', /Pick up/.test(rd.btn) && Math.abs(secs(rd.clock) - endedRemain) <= 1, rd);
  await p.click('#startBtn'); await sleep(1500); let s6 = await st(p);
  ok('resumed session starts from saved time', Math.abs(secs(s6.clock) - endedRemain) <= 2, [s6.clock, endedRemain]);
  await sleep(7000); let s7 = await st(p);
  const beforeKill = s7.eden;
  await p.goto('chrome://crash').catch(() => {}); await sleep(1500); await b.close(); await sleep(500);
  // ---- Run B: reopen after "force-stop", then quiet auto-end (test flag 10 s)
  ({ b, p } = await open('quiet.wav', '?quietEnd=10'));
  let s8 = await st(p); await p.screenshot({ path: SHOTS + '07-after-force-stop.png' });
  ok('time persists after page crashed mid-session', s8.eden >= beforeKill - 0.5 && s8.eden > s5.eden, [s5.eden, beforeKill, s8.eden, s8.cards[2]]);
  await sleep(1500);
  const rows = fs.readFileSync('posted.jsonl', 'utf8').trim().split('\n').filter(Boolean).flatMap(l => JSON.parse(l).rows || []);
  ok('cut-off session was logged on reopen', rows.some(r => r.endedBy === 'closed') && rows.some(r => r.endedBy === 'end'), rows.map(r => [r.kid, r.instrument, r.actual, r.dayTotal, r.completed, r.endedBy]));
  await p.click('.kid:nth-child(3)'); await p.click('#startBtn'); await sleep(6500);
  let s9 = await st(p); await p.screenshot({ path: SHOTS + '08-quiet-warning.png' });
  ok('quiet countdown shown', /No sound/.test(s9.warn), s9.warn);
  await sleep(5000); let s10 = await st(p); await p.screenshot({ path: SHOTS + '09-quiet-auto-ended.png' });
  ok('no sound -> auto-end, saved, home', s10.screen === 'pick' && /No sound/.test(s10.toast) && Math.abs(s10.eden - s8.eden) < 1, s10);
  await b.close();
  // ---- Run C: reach target (shortened) -> celebrate, then "done today"
  ({ b, p } = await open('play.wav'));
  await p.evaluate(() => { const k = window.__wpt.KIDS[2]; k.minutes = (window.__wpt.doneToday(k) + 8) / 60; });
  await p.click('.kid:nth-child(3)'); await p.click('#startBtn');
  for (let i = 0; i < 25; i++) { await sleep(1000); if ((await st(p)).screen === 'celebrate') break; }
  let s11 = await st(p); await sleep(800); await p.screenshot({ path: SHOTS + '10-target-celebrate.png' });
  ok('reaching target celebrates', s11.screen === 'celebrate', s11.screen);
  await p.click('#finishBtn'); await sleep(300); await p.click('.kid:nth-child(3)'); await sleep(300);
  let dn = await p.evaluate(() => ({ msg: document.getElementById('doneToday').textContent, startHidden: document.getElementById('startBtn').style.display === 'none' }));
  await p.screenshot({ path: SHOTS + '11-done-today.png' });
  ok('done today: start hidden', dn.startHidden && /done today/.test(dn.msg), dn);
  ok('no page errors (A-C)', !p.errs.length, p.errs);
  await b.close();
  // ---- Run D: next day resets
  ({ b, p } = await open('quiet.wav', '', { dayShift: 1 }));
  let s12 = await st(p); await p.screenshot({ path: SHOTS + '12-next-day-reset.png' });
  ok('next day starts fresh', s12.eden === 0 && !/done|Done/.test(s12.cards[2]), s12.cards);
  await b.close(); srv.close();
  console.log(R.join('\n'));
})().catch(e => { console.error(e); process.exit(1); });
