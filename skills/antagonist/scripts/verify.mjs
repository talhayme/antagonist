#!/usr/bin/env node
// Decide whether suspected defects are real, without a model.
//
// Usage: node verify.mjs <base-url> <finding.json>... [options]
//   --allow, --timezone, --clock, --reset   as in run.mjs; a finding's own "env" is used when a flag is absent
//
// Two kinds of finding:
//
//   differential (default): "control" and "attack" are the same journey, and
//     the attack differs in one hostile element. CONFIRMED when the control
//     satisfies "expect" and the attack violates it.
//
//   "kind": "lost": one journey, "steps". "expect" must hold after the first
//     "checkpoint" steps and be violated after all of them. For work the app
//     accepts and then loses: a save that does not survive a reload.
//
// Each side is replayed twice from a clean browser. Exit code 0 only when
// every finding is CONFIRMED.

import fs from 'node:fs';
import { execSync } from 'node:child_process';
await import('./setup.mjs');
const { replay, closeBrowser, violations, validateExpect, parseArgs, environment } = await import('./lib.mjs');

const { flags, positional } = parseArgs(process.argv.slice(2), ['--allow', '--timezone', '--clock', '--reset', '--viewport', '--server-clock', '--cookies']);
const [baseUrl, ...findingPaths] = positional;
if (!baseUrl || !findingPaths.length) {
    console.error(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 20).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(2);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const short = step => JSON.stringify(step).slice(0, 110);

// How the attack differs from the control, in words, and whether the control
// could be passing without ever touching what the attack tests.
function difference(control, attack) {
    let head = 0;
    while (head < control.length && head < attack.length && same(control[head], attack[head])) head++;
    let tail = 0;
    while (tail < control.length - head && tail < attack.length - head && same(control.at(-1 - tail), attack.at(-1 - tail))) tail++;
    const onlyControl = control.slice(head, control.length - tail);
    const onlyAttack = attack.slice(head, attack.length - tail);
    const lines = [];
    if (!onlyControl.length && !onlyAttack.length) return { lines: ['control and attack are identical'], identical: true, warnings: [] };
    for (const step of onlyControl) lines.push(`control only: ${short(step)}`);
    for (const step of onlyAttack) lines.push(`attack only:  ${short(step)}`);
    const warnings = [];
    if (Math.max(onlyControl.length, onlyAttack.length) > 2) warnings.push('they differ in more than two steps: a control should be the same journey with one hostile element changed');
    if (tail === 0 && onlyControl.length !== onlyAttack.length) warnings.push('the journeys end differently: if the control never reaches the screen the expectation is about, it proves nothing. Consider "kind": "lost".');
    return { lines, identical: false, warnings };
}

async function observeAndJudge(steps, expect, env, baseline = null) {
    const seen = await replay(baseUrl, steps, env);
    try {
        if (seen.failedStep) return { failed: [`step ${seen.failedStep.index} could not run: ${seen.failedStep.error}`], stepFailed: true, errors: seen.errors };
        return { failed: await violations(seen, expect, baseline), stepFailed: false, errors: seen.errors };
    } finally {
        await seen.close();
    }
}

// Server-side data is shared between runs, so with a reset command the runs go one at a time.
async function twice(steps, expect, env, baseline) {
    if (env.reset) return [await observeAndJudge(steps, expect, env, baseline), await observeAndJudge(steps, expect, env, baseline)];
    return Promise.all([observeAndJudge(steps, expect, env, baseline), observeAndJudge(steps, expect, env, baseline)]);
}

async function verify(path) {
    const finding = JSON.parse(fs.readFileSync(path, 'utf8'));
    const env = environment(flags, finding.env ?? {}, path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : null);
    const kind = finding.kind ?? 'differential';
    const problems = kind === 'crash' ? [] : validateExpect(finding.expect);
    if (!finding.title) problems.push('missing "title"');
    // A crash finding is special: the server does not survive the attack, so it cannot be
    // replayed four times. It needs a `reset` that restarts the server, a `baseline` journey
    // the healthy server survives, and the `attack` that takes it down. CONFIRMED when the
    // server answers after the baseline and does not answer after the attack, twice each.
    if (kind === 'crash') {
        if (!env.reset) problems.push('"kind": "crash" needs a "reset" that restarts the server, as a flag or in the finding\'s env');
        if (!Array.isArray(finding.attack)) problems.push('"kind": "crash" needs an "attack" (the steps that take the server down)');
        const base = finding.baseline ?? [];
        const probe = typeof finding.probe === 'string' ? finding.probe : '/';
        if (problems.length) return { path, verdict: 'INVALID', title: finding.title ?? path, lines: problems };
        const alive = async steps => {
            const seen = await replay(baseUrl, steps, env); // env.reset restarts the server first
            await seen.close();
            const url = new URL(probe, baseUrl).href;
            return fetch(url, { method: 'GET' }).then(r => r.status < 500).catch(() => false);
        };
        const aliveAfterBaseline = [await alive(base), await alive(base)];
        const aliveAfterAttack = [await alive(finding.attack), await alive(finding.attack)];
        const survives = aliveAfterBaseline.every(Boolean);
        const dies = aliveAfterAttack.every(a => !a);
        let verdict = 'CONFIRMED';
        if (!survives) verdict = 'NOT CONFIRMED: the server is already down after the baseline journey — the environment or reset is wrong';
        else if (!dies) verdict = 'NOT CONFIRMED: the server still answers after the attack in at least one run';
        // leave the server up for whoever runs next
        if (env.reset) try { execSync(env.reset, { stdio: 'ignore', timeout: 60_000, shell: '/bin/sh', cwd: env.cwd ?? process.cwd() }); } catch {}
        return {
            path, verdict, title: finding.title,
            lines: [
                `probe: GET ${probe}`,
                `after baseline: ${aliveAfterBaseline.map(a => (a ? 'answers' : 'DOWN')).join(' / ')}`,
                `after attack:   ${aliveAfterAttack.map(a => (a ? 'answers' : 'DOWN')).join(' / ')}`
            ]
        };
    }
    let holdSteps, breakSteps, notes = [];
    if (kind === 'lost') {
        if (!Array.isArray(finding.steps) || !Number.isInteger(finding.checkpoint) || finding.checkpoint < 1 || finding.checkpoint >= finding.steps.length)
            problems.push('"kind": "lost" needs "steps" and a "checkpoint" between 1 and the number of steps minus one');
        else {
            holdSteps = finding.steps.slice(0, finding.checkpoint);
            breakSteps = finding.steps;
            notes = [`holds after ${finding.checkpoint} step(s); then: ${finding.steps.slice(finding.checkpoint).map(short).join(' -> ')}`];
        }
    } else {
        if (!Array.isArray(finding.control) || !Array.isArray(finding.attack)) problems.push('needs "control" and "attack", each a list of steps');
        else {
            const diff = difference(finding.control, finding.attack);
            if (diff.identical) problems.push('control and attack are identical');
            holdSteps = finding.control;
            breakSteps = finding.attack;
            notes = [...diff.lines, ...diff.warnings.map(w => `WARNING: ${w}`)];
        }
    }
    if (problems.length) return { path, verdict: 'INVALID', title: finding.title ?? path, lines: problems };

    const hold = await twice(holdSteps, finding.expect, env, null);
    const baseline = { errors: hold[0].errors };
    const broke = await twice(breakSteps, finding.expect, env, baseline);

    const holds = hold.every(r => r.failed.length === 0);
    const ran = broke.every(r => !r.stepFailed);
    const breaks = broke.every(r => r.failed.length > 0);
    const steady = broke[0].failed.join('|') === broke[1].failed.join('|');
    const [left, right] = kind === 'lost' ? ['at checkpoint', 'at the end'] : ['control', 'attack'];

    let verdict;
    if (!holds) verdict = `NOT CONFIRMED: the expectation does not hold ${left}, so the expectation or the journey is wrong`;
    else if (!ran) verdict = 'NOT CONFIRMED: the steps could not be replayed';
    else if (!breaks) verdict = `NOT CONFIRMED: the expectation is not violated ${right} in both runs`;
    else if (!steady) verdict = 'NOT CONFIRMED: the two runs fail in different ways (flaky)';
    else verdict = 'CONFIRMED';
    return {
        path,
        verdict,
        title: finding.title,
        lines: [
            ...notes,
            `${left}: ${hold.map(r => (r.failed.length ? 'FAILS — ' + r.failed.join('; ') : 'holds')).join(' / ')}`,
            `${right}: ${broke.map(r => (r.failed.length ? 'violates — ' + r.failed.join('; ') : 'holds')).join(' / ')}`
        ]
    };
}

let confirmed = 0;
for (const [index, path] of findingPaths.entries()) {
    process.stderr.write(`[${index + 1}/${findingPaths.length}] ${path} ...\n`);
    let result;
    try {
        result = await verify(path);
    } catch (error) {
        result = { path, verdict: 'INVALID', title: path, lines: [String(error.message).split('\n')[0]] };
    }
    if (result.verdict === 'CONFIRMED') confirmed++;
    console.log(`${result.verdict}\n  ${result.title}  (${result.path})\n${result.lines.map(l => '  ' + l).join('\n')}\n`);
}
await closeBrowser();
if (findingPaths.length > 1) console.log(`${confirmed} of ${findingPaths.length} confirmed`);
process.exit(confirmed === findingPaths.length ? 0 : 1);
