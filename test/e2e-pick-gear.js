const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs');
const URL = process.argv[2] || 'http://localhost:8770/'; const tag = URL.includes('github.io') ? 'live' : 'local';
const srv = http.createServer((q, r) => { if (q.method==='POST'){q.resume();q.on('end',()=>r.end('{}'));return;} if (q.url.startsWith('/log')) { r.setHeader('access-control-allow-origin','*'); return r.end('{"ok":true}'); } r.setHeader('content-type','text/html'); r.end(fs.readFileSync('/workspace/practice-timer/index.html')); }).listen(8770);
const sleep = ms => new Promise(r => setTimeout(r, ms)); const R = []; const ok = (n, c, x) => R.push((c ? 'PASS ' : 'FAIL ') + n + (x ? ' ' + JSON.stringify(x) : ''));
const sizes = [['ipad-landscape',1024,768],['ipad-portrait',768,1024],['ipadair-landscape',1180,820],['phone-portrait',375,667],['phone-big',390,844],['phone-landscape',667,375]];
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture=/tmp/jstest/play.wav'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.setUserAgent('Mozilla/5.0 (iPad; CPU OS 12_5_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1');
  await p.evaluateOnNewDocument(() => { delete window.PointerEvent; });   // iOS 12 has no Pointer Events
  await p.setRequestInterception(true); p.on('request', r => (r.method()==='POST'||r.url().includes('script.google.com')) ? r.abort() : r.continue());
  await p.setViewport({ width: 1024, height: 768, hasTouch: true, isMobile: true });
  await p.goto(URL + '?v=' + Date.now(), { waitUntil: 'networkidle2' });
  // worst case: today's progress on cards + a saved-time notice
  await p.evaluate(() => { const w = window.__wpt; const d = w.dayOf(); const m = {}; w.KIDS.forEach((k, i) => m[k.name + '|' + k.instrument] = i * 200); w.store.set('day.' + d, m); });
  await p.reload({ waitUntil: 'networkidle2' });
  for (const withToast of [false, true]) for (const [name, w, h] of sizes) {
    await p.setViewport({ width: w, height: h, hasTouch: true, isMobile: true }); await sleep(300);
    if (withToast) await p.evaluate(() => { const t = document.getElementById('toast'); t.textContent = 'No sound for 3 minutes, so practice was saved and ended. Eden · Piano: 6:40 of 20:00 saved for today. Tap your name to pick up where you left off.'; t.className = 'toast on warn'; });
    const r = await p.evaluate(() => {
      const ov = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      const note = document.querySelector('#pick .note').getBoundingClientRect(); const cards = [...document.querySelectorAll('.kid')].map(k => k.getBoundingClientRect());
      const els = ['h1','.sub','#toast','#kids'].map(s => document.querySelector('#pick ' + s)).filter(e => e && e.getBoundingClientRect().height);
      const stacked = els.every((e, i) => i === 0 || els[i-1].getBoundingClientRect().bottom <= e.getBoundingClientRect().top + 1);
      const pk = document.getElementById('pick'); pk.scrollTop = 1e6;
      const n2 = document.querySelector('#pick .note').getBoundingClientRect();
      return { noteOverlap: cards.some(c => ov(c, note)), noteBelow: cards.every(c => c.bottom <= note.top), stacked, noteReachable: n2.bottom <= innerHeight + 1 };
    });
    await p.evaluate(() => document.getElementById('pick').scrollTop = 0);
    ok(`${name} ${w}x${h}${withToast ? ' +notice' : ''}: help text below cards, no overlap, scrollable`, !r.noteOverlap && r.noteBelow && r.stacked && r.noteReachable, r);
    if (!withToast) await p.screenshot({ path: `/workspace/kiddos-shots/timer/18-${tag}-pick-${name}.png` });
    // gear: topmost at its center, and a tap opens settings
    const top = await p.evaluate(() => { const g = document.getElementById('gear').getBoundingClientRect(); const e = document.elementFromPoint(g.left + g.width / 2, g.top + g.height / 2); return { hit: e && e.id, size: [g.width, g.height] }; });
    await p.tap('#gear'); await sleep(400);
    const open = await p.evaluate(() => document.getElementById('panel').classList.contains('on'));
    if (name === 'ipad-landscape' && !withToast) await p.screenshot({ path: `/workspace/kiddos-shots/timer/18-${tag}-settings-open-ipad-landscape.png` });
    ok(`${name}${withToast ? ' +notice' : ''}: gear on top and one tap opens settings`, top.hit === 'gear' && open, { top, open });
    await p.tap('#closePanel'); await sleep(300);
  }
  // gear on practice screen with landscape metronome panel open
  await p.setViewport({ width: 1024, height: 768, hasTouch: true, isMobile: true }); await sleep(300);
  await p.evaluate(() => { document.getElementById('toast').className = 'toast'; });
  await p.tap('.kid:nth-child(1)'); await p.tap('#startBtn'); await sleep(2000); await p.tap('#metroToggle'); await sleep(300);
  const top2 = await p.evaluate(() => { const g = document.getElementById('gear').getBoundingClientRect(), m = document.getElementById('metro').getBoundingClientRect(); const e = document.elementFromPoint(g.left + g.width / 2, g.top + g.height / 2); return { hit: e && e.id, overlapMetro: !(g.right <= m.left || g.left >= m.right || g.bottom <= m.top || g.top >= m.bottom) }; });
  await p.tap('#gear'); await sleep(400); const open2 = await p.evaluate(() => document.getElementById('panel').classList.contains('on'));
  await p.screenshot({ path: `/workspace/kiddos-shots/timer/18-${tag}-practice-gear-with-metronome.png` });
  ok('practice screen + metronome open: gear tappable', top2.hit === 'gear' && !top2.overlapMetro && open2, { top2, open2 });
  await p.tap('#closePanel'); await sleep(300); await p.tap('#doneBtn'); await sleep(400);
  ok('no page errors', !errs.length, errs);
  console.log(R.join('\n')); await b.close(); srv.close();
})();
