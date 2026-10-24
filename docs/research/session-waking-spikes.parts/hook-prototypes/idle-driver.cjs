// AIF-012 Task 004 - THROWAWAY SPIKE. Drives `claude -p --input-format stream-json` with stdin held open
// so the session is idle after the first turn; logs every stdout event with elapsed seconds.
// usage: node idle-driver.js <settings.json> <hold_seconds> <prompt>
const { spawn } = require('node:child_process');
const [settings, hold, prompt] = process.argv.slice(2);
const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(1);
const p = spawn(
  'claude',
  [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--model',
    'haiku',
    '--settings',
    settings,
    '--setting-sources',
    'project',
  ],
  { shell: true },
);
let buf = '';
p.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const l = buf.slice(0, i);
    buf = buf.slice(i + 1);
    try {
      const j = JSON.parse(l);
      const txt = j.message?.content?.map?.((c) => c.text || '').join('') || j.result || '';
      console.log(
        `[${el()}s] ${j.type}/${j.subtype || ''} ${String(txt).slice(0, 500).replace(/\n/g, ' ')}`,
      );
    } catch {
      console.log(`[${el()}s] raw ${l.slice(0, 120)}`);
    }
  }
});
p.stderr.on('data', (d) => console.log(`[${el()}s] stderr ${String(d).slice(0, 200)}`));
p.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: prompt } }) + '\n');
setTimeout(
  () => {
    console.log(`[${el()}s] closing stdin`);
    p.stdin.end();
  },
  Number(hold) * 1000,
);
p.on('exit', (c) => console.log(`[${el()}s] exit ${c}`));
