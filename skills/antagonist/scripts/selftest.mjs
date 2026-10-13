#!/usr/bin/env node
// Checks the promise run.mjs makes: every target it prints resolves, in a
// step, to the control it was printed next to.
//
// Usage: node selftest.mjs <base-url> [steps.json] [--allow host,host]

import fs from 'node:fs';
import { replay, closeBrowser, locate, parseArgs, environment } from './lib.mjs';

const { flags, positional } = parseArgs(process.argv.slice(2), ['--allow', '--timezone', '--clock', '--reset', '--viewport', '--server-clock', '--cookies']);
const [baseUrl, stepsPath] = positional;
const steps = stepsPath ? JSON.parse(fs.readFileSync(stepsPath, 'utf8')) : [];
const seen = await replay(baseUrl, steps, environment(flags));
let bad = 0;
for (const line of seen.controls) {
    const target = JSON.parse(line.slice(0, line.indexOf('}  ') + 1));
    const tag = line.slice(line.indexOf('}  ') + 3).match(/^[a-z]+/)[0];
    try {
        const element = await locate(seen.page, target);
        const actual = await element.evaluate(el => el.tagName.toLowerCase());
        const actionable = await element.isEnabled().catch(() => false);
        if (actual !== tag) throw new Error(`resolves to <${actual}>`);
        if (!actionable && !/disabled/.test(line)) throw new Error('resolves but is not enabled');
    } catch (error) {
        bad++;
        console.log(`BAD  ${line}\n     ${String(error.message).split('\n')[0]}`);
    }
}
await seen.close();
await closeBrowser();
console.log(`${seen.controls.length - bad} of ${seen.controls.length} printed targets resolve to their control`);
process.exit(bad ? 1 : 0);
