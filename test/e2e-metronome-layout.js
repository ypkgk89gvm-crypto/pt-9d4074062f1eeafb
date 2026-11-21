const puppeteer = require('puppeteer-core'); const http = require('http'); const fs = require('fs');
const URL = process.argv[2] || 'http://localhost:8769/'; const tag = URL.includes('github.io') ? 'live' : 'local';
const srv = http.createServer((q, r) => { if (q.method==='POST'){q.resume();q.on('end',()=>r.end('{}'));return;} if (q.url.startsWith('/log')) { r.setHeader('access-control-allow-origin','*'); return r.end('{"ok":true}'); } r.setHeader('content-type','text/html'); r.end(fs.readFileSync('/workspace/practice-timer/index.html')); }).listen(8769);
const sleep = ms => new Promise(r => setTimeout(r, ms)); const R = []; const ok = (n, c, x) => R.push((c ? 'PASS ' : 'FAIL ') + n + (x ? ' ' + JSON.stringify(x) : ''));
const sizes = [['ipad-portrait',768,1024],['ipad-landscape',1024,768],['ipadair-portrait',820,1180],['ipadair-landscape',1180,820],['ipadpro-landscape',1366,1024],['phone-portrait',375,667],['phone-big',390,844],['phone-landscape',667,375]];
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture=/tmp/jstest/play.wav'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.setUserAgent('Mozilla/5.0 (iPad; CPU OS 12_5_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1');
  await p.setRequestInterception(true); p.on('request', r => (r.method()==='POST'||r.url().includes('script.google.com')) ? r.abort() : r.continue());
  await p.setViewport({ width: sizes[0][1], height: sizes[0][2], hasTouch: true, isMobile: true });
  await p.goto(URL + '?v=' + Date.now(), { waitUntil: 'networkidle2' });
  await p.tap('.kid:nth-child(1)'); await p.tap('#startBtn'); await sleep(2500);
  await p.tap('#metroToggle'); await sleep(300);
  for (const [name, w, h] of sizes) {
    await p.setViewport({ width: w, height: h, hasTouch: true, isMobile: true }); await sleep(500);
    await p.evaluate(() => document.getElementById('practice').scrollTop = 0); await sleep(100);
    const res = await p.evaluate(() => {
      const m = document.getElementById('metro').getBoundingClientRect(); const out = {};
      const ov = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      ['clock','pauseBtn','doneBtn','metroToggle','status'].forEach(id => { const e = document.getElementById(id), r = e.getBoundingClientRect(); if (!r.width) { out[id] = { hidden: true, overlap: false, inView: true, topHit: true }; return; }
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const hit = document.elementFromPoint(cx, cy);
        out[id] = { overlap: ov(r, m), inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, topHit: !!hit && (hit === e || e.contains(hit)) }; });
      return { mode: m.top < 100 ? 'side' : 'bar', metro: [Math.round(m.left), Math.round(m.top), Math.round(m.width), Math.round(m.height)], out, mGoVisible: (() => { const r = document.getElementById('mGo').getBoundingClientRect(); return r.bottom <= innerHeight && r.right <= innerWidth && r.width > 0; })() };
    });
    const noOverlap = Object.values(res.out).every(o => !o.overlap);
    const tappable = ['pauseBtn','doneBtn','metroToggle'].every(id => res.out[id].inView ? res.out[id].topHit : true);
    const allInView = ['clock','pauseBtn','doneBtn'].every(id => res.out[id].inView);
    ok(`${name} ${w}x${h} [${res.mode}] no overlap`, noOverlap, noOverlap ? null : res.out);
    ok(`${name} Pause/End tappable (not covered)`, tappable, res.out);
    R.push(`     ${name}: clock+Pause+End all on screen without scrolling: ${allInView}; Start/Stop visible: ${res.mGoVisible}; panel ${res.metro}`);
    if (!allInView) { // scroll practice to bottom and verify buttons then uncovered
      const r2 = await p.evaluate(() => { const pr = document.getElementById('practice'); pr.scrollTop = 1e6; const e = document.getElementById('doneBtn').getBoundingClientRect(), pb = document.getElementById('pauseBtn').getBoundingClientRect();
        const hitE = document.elementFromPoint(e.left + e.width/2, e.top + e.height/2), hitP = document.elementFromPoint(pb.left + pb.width/2, pb.top + pb.height/2);
        return hitE && hitE.id === 'doneBtn' && hitP && hitP.id === 'pauseBtn'; });
      ok(`${name} after scrolling, Pause/End uncovered`, r2);
    }
    await p.screenshot({ path: `/workspace/kiddos-shots/timer/17-metronome-compact-${tag}-${name}.png` });
  }
  // functional: tap Pause and End through the open panel layout (iPad portrait)
  await p.setViewport({ width: 768, height: 1024, hasTouch: true, isMobile: true }); await sleep(400);
  await p.tap('#mGo'); await sleep(300); await p.tap('#mPlus'); await sleep(200);
  await p.tap('#pauseBtn'); const pz = await p.$eval('#pauseBtn', e => e.textContent); ok('Pause tapped with panel open', /Resume/.test(pz), pz);
  await p.tap('#pauseBtn'); await p.tap('#mClose'); await sleep(300);
  const hid = await p.evaluate(() => ({ open: document.getElementById('metro').style.display !== 'none', btn: document.getElementById('metroToggle').textContent, pad: document.getElementById('practice').style.paddingBottom + '|' + document.getElementById('practice').style.paddingRight }));
  ok('✕ Hide closes, padding removed, badge shows', !hid.open && /on · 81/.test(hid.btn) && hid.pad === '|', hid);
  await p.tap('#metroToggle'); await sleep(200); await p.tap('#metroToggle'); await sleep(200);
  ok('toggle open/close', await p.evaluate(() => document.getElementById('metro').style.display === 'none'));
  await p.tap('#doneBtn'); await sleep(500); ok('End tapped -> home, metronome stopped', await p.evaluate(() => document.querySelector('.screen.on').id === 'pick' && !window.__wpt.metro.isRunning()));
  ok('no page errors', !errs.length, errs);
  console.log(R.join('\n')); await b.close(); srv.close();
})();
