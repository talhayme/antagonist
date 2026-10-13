#!/usr/bin/env node
// Replay steps from a fresh browser and print what is on screen at the end.
//
// Usage: node run.mjs <base-url> [steps.json] [options]
//   --full                 print all of the text (default: first 2,500 characters)
//   --storage              print the values the app saved in the browser, not only the keys
//   --screenshot <file>    save a picture of the final screen (for charts and layout)
//   --allow <host,host>    let the page reach these other hosts (CDNs)
//   --timezone <id>        run the browser in this time zone, e.g. Asia/Tokyo
//   --clock <iso-time>     freeze the browser's clock, e.g. 2026-03-01T00:30:00
//   --reset <command>      run this shell command first, to put server data back
//   --viewport <WxH>       browser window size, default 1280x900
//   --only <regex>         list only the controls matching this (long screens)
//   --within <css>         print text and controls only from this region, e.g. main
//
// With no steps file it shows the first screen. Every run starts from a clean
// browser, so a steps file is always a complete reproduction.

import fs from 'node:fs';
await import('./setup.mjs');
const { replay, closeBrowser, parseArgs, environment } = await import('./lib.mjs');

const { flags, positional } = parseArgs(process.argv.slice(2), ['--allow', '--timezone', '--clock', '--reset', '--screenshot', '--viewport', '--only', '--within', '--server-clock', '--cookies']);
const [baseUrl, stepsPath] = positional;
if (!baseUrl) {
    console.error(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 14).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(2);
}
let steps = [];
if (stepsPath) {
    steps = JSON.parse(fs.readFileSync(stepsPath, 'utf8'));
    if (!Array.isArray(steps)) {
        console.error('a steps file is a JSON array of steps; to check a finding file use verify.mjs');
        process.exit(2);
    }
}
const seen = await replay(baseUrl, steps, environment(flags), { screenshot: flags['--screenshot'] ?? null, within: flags['--within'] ?? null });
await seen.close();
await closeBrowser();
const limit = flags['--full'] ? Infinity : 2500;
const cut = text => text.slice(0, limit) + (text.length > limit ? '\n…(cut; --full shows all)' : '');

if (seen.failedStep) {
    const f = seen.failedStep;
    console.log(`STOPPED AT STEP ${f.index} ${JSON.stringify(f.step)}\n  ${f.error}\n  The ${f.notRun} step(s) after it were not run. Everything below is the screen at the moment it stopped.\n`);
}
const onlyEarly = flags['--only'] ? new RegExp(flags['--only'], 'i') : null;
for (const shot of seen.snapshots) shot.controls = onlyEarly ? shot.controls.filter(c => onlyEarly.test(c)) : shot.controls;
for (const shot of seen.snapshots) console.log(`SNAPSHOT "${shot.name}"  ${shot.url}\n${cut(shot.text)}\n${shot.controls.length ? 'controls:\n' + shot.controls.join('\n') + '\n' : ''}${shot.downloads.length ? `(downloads so far: ${shot.downloads.map(d => d.name).join(', ')})\n` : ''}`);
console.log(`URL    ${seen.url}`);
console.log(`\nTEXT (${seen.text.length} chars; what a user can read. Values typed into fields are under CONTROLS)\n${cut(seen.text)}`);
const only = flags['--only'] ? new RegExp(flags['--only'], 'i') : null;
const shown = only ? seen.controls.filter(c => only.test(c)) : seen.controls;
console.log(`\nCONTROLS (a target to copy into a step, then what it is)${only ? ` — ${shown.length} of ${seen.controls.length} match --only` : ''}\n${shown.join('\n') || '(none)'}`);
if (seen.notes.length) console.log(`\nNOTES\n${seen.notes.join('\n')}`);
console.log(`\nERRORS\n${seen.errors.map(e => `${e.kind}: ${e.text}`).join('\n') || '(none)'}`);
if (seen.dialogs.length) console.log(`\nDIALOGS (native confirm/alert boxes, answered automatically)\n${seen.dialogs.map(d => `${d.type} "${d.message}" -> ${d.answered}`).join('\n')}`);
console.log(`\nREQUESTS (the app's calls to its own server)\n${seen.requests.slice(-25).map(r => `${r.method} ${r.path} -> ${r.status}${r.body ? '  ' + r.body : ''}`).join('\n') || '(none: this app has no API of its own; skip catalog/server.md)'}`);
if (seen.downloads.length) console.log(`\nDOWNLOADS\n${seen.downloads.map(d => `--- ${d.name}\n${d.text.slice(0, 1500)}`).join('\n')}`);
const keys = Object.keys(seen.storage);
if (keys.length) console.log(`\nSAVED IN THE BROWSER\n${keys.map(k => (flags['--storage'] ? `${k} = ${seen.storage[k].slice(0, 1500)}` : `${k} (${seen.storage[k].length} chars)`)).join('\n')}${flags['--storage'] ? '' : '\n(--storage prints the values)'}`);
if (seen.blockedHosts.length) console.log(`\nBLOCKED HOSTS (the page tried to reach these; --allow lets it)\n${seen.blockedHosts.join(', ')}`);
if (seen.cookies) console.log(`\nCOOKIE HEADER (for curl against this same local app)\n${seen.cookies}`);
if (flags['--screenshot']) console.log(`\nSCREENSHOT saved to ${flags['--screenshot']}`);
