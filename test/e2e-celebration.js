const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs');
const URL = process.argv[2] || 'http://localhost:8771/'; const tag = URL.includes('github.io') ? 'live' : 'local';
const srv = http.createServer((q, r) => { if (q.method==='POST'){q.resume();q.on('end',()=>r.end('{}'));return;} if (q.url.startsWith('/log')) { r.setHeader('access-control-allow-origin','*'); return r.end('{"ok":true}'); }
  if (q.url.startsWith('/dad-celebrate.gif')) { r.setHeader('content-type','image/gif'); return r.end(fs.readFileSync('/workspace/practice-timer/dad-celebrate.gif')); }
  if (q.url.startsWith('/celebrate.mp4')) { r.statusCode = 404; return r.end(); }
  r.setHeader('content-type','text/html'); r.end(fs.readFileSync('/workspace/practice-timer/index.html')); }).listen(8771);
const sleep = ms => new Promise(r => setTimeout(r, ms)); const R = []; const ok = (n, c, x) => R.push((c ? 'PASS ' : 'FAIL ') + n + (x ? ' ' + JSON.stringify(x) : ''));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture=/tmp/jstest/play.wav','--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.setUserAgent('Mozilla/5.0 (iPad; CPU OS 12_5_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1');
  await p.evaluateOnNewDocument(() => { delete window.PointerEvent; });
  await p.setRequestInterception(true); p.on('request', r => (r.method()==='POST'||r.url().includes('script.google.com')) ? r.abort() : r.continue());
  await p.setViewport({ width: 1024, height: 768, hasTouch: true, isMobile: true });
  await p.goto(URL + '?v=' + Date.now(), { waitUntil: 'networkidle2' });
  // pretend Ellis already practiced 5 min today and Abram trumpet 22 min (old goal 20 would have been "done")
  await p.evaluate(() => { const w = window.__wpt; localStorage.removeItem('wpt.day.' + w.dayOf()); w.store.set('day.' + w.dayOf(), { 'Ellis|Violin': 300, 'Abram|Trumpet': 1320 }); });
  await p.reload({ waitUntil: 'networkidle2' });
  const cards = await p.$$eval('.kid', a => a.map(x => x.innerText.replace(/\n/g, ' ')));
  ok('new goals on cards, today\'s time kept', /Trumpet · 25 min 22:00 done · 3:00 left/.test(cards[1]) && /Violin · 20 min 5:00 done · 15:00 left/.test(cards[3]) && /Piano · 40 min/.test(cards[0]) && /Piano · 20 min/.test(cards[2]), cards);
  for (const [name, w, h] of [['ipad-landscape', 1024, 768], ['ipad-portrait', 768, 1024]]) {
    await p.setViewport({ width: w, height: h, hasTouch: true, isMobile: true }); await sleep(300);
    await p.evaluate(() => { const k = window.__wpt.KIDS[2]; k.minutes = (window.__wpt.doneToday(k) + 6) / 60; });   // test only: Eden finishes in ~6 s
    await p.tap('.kid:nth-child(3)'); await p.tap('#startBtn');
    let s; for (let i = 0; i < 25; i++) { await sleep(1000); s = await p.evaluate(() => document.querySelector('.screen.on').id); if (s === 'celebrate') break; }
    await sleep(1500);
    const c = await p.evaluate(() => { const g = document.getElementById('dadGif'), r = g.getBoundingClientRect(), f = document.getElementById('finishBtn').getBoundingClientRect();
      return { screen: document.querySelector('.screen.on').id, title: document.getElementById('celebTitle').textContent, gif: [g.complete, g.naturalWidth, Math.round(r.width), Math.round(r.height)], btnInView: f.bottom <= innerHeight && f.top >= 0, session: !!window.__wpt.getSession() }; });
    await p.screenshot({ path: `/workspace/kiddos-shots/timer/19-celebration-${tag}-${name}.png` });
    ok(`${name}: finishing shows the dad GIF + message`, c.screen === 'celebrate' && /Great job, Eden! You finished!/.test(c.title) && c.gif[0] && c.gif[1] === 460 && c.gif[2] > 250 && c.btnInView && !c.session, c);
    await p.tap('#finishBtn'); await sleep(400);
    const home = await p.evaluate(() => ({ s: document.querySelector('.screen.on').id, card: document.querySelectorAll('.kid')[2].innerText.replace(/\n/g, ' ') }));
    ok(`${name}: Back home dismisses`, home.s === 'pick' && /Done today/.test(home.card), home);
    await p.evaluate(() => { const w = window.__wpt; const m = w.store.get('day.' + w.dayOf(), {}); delete m['Eden|Piano']; w.store.set('day.' + w.dayOf(), m); window.__wpt.KIDS[2].minutes = 20; });
    await p.evaluate(() => document.querySelector('.kid:nth-child(3)').click()); await p.tap('#backBtn');
  }
  ok('no page errors', !errs.length, errs);
  console.log(R.join('\n')); await b.close(); srv.close();
})();
