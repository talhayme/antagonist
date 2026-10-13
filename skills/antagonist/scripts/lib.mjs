// Shared by run.mjs and verify.mjs: replay a list of steps in a fresh browser
// context and return what a user (and the network) saw.

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

// What run.mjs lists under CONTROLS: a Playwright selector and the ARIA role
// its elements usually have. Listing goes through the same locators the steps
// use, so a printed target always resolves to the element it was printed for.
const KINDS = [
    ['button:visible, [role=button]:visible', 'button'],
    ['a[href]:visible', 'link'],
    ['select:visible', 'combobox'],
    ['textarea:visible', 'textbox'],
    ['input:visible', null],
    ['[role=tab]:visible', 'tab'],
    ['[role=checkbox]:visible', 'checkbox'],
    ['[contenteditable=true]:visible', 'textbox']
];
const ROWS = 'tr, li, [role=row], [role=listitem], article, section > div, [class*=card], [class*=row], [class*=item]';

export function parseArgs(argv, valueFlags) {
    const flags = {};
    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (valueFlags.includes(arg)) flags[arg] = argv[++i];
        else if (arg.startsWith('--')) flags[arg] = true;
        else positional.push(arg);
    }
    return { flags, positional };
}

export function environment(flags, fromFile = {}, fileDir = null) {
    const size = (flags['--viewport'] ?? fromFile.viewport ?? '').toString().match(/^(\d+)x(\d+)$/);
    return {
        viewport: size ? { width: Number(size[1]), height: Number(size[2]) } : undefined,
        // A reset command written in a finding file runs from that file's folder.
        cwd: flags['--reset'] ? process.cwd() : fileDir,
        allowHosts: (flags['--allow'] ?? fromFile.allow ?? '').toString().split(',').filter(Boolean),
        timezone: flags['--timezone'] ?? fromFile.timezone,
        clock: flags['--clock'] ?? fromFile.clock,
        reset: flags['--reset'] ?? fromFile.reset,
        serverClock: flags['--server-clock'] ?? fromFile.serverClock,
        // "name=value; name2=value2", sent from the first request on: replays start signed in
        // without spending one of the app's limited logins.
        cookies: flags['--cookies'] ?? fromFile.cookies
    };
}

async function innermost(candidates) {
    // Of the containers that hold the text, the one with the least text is the row itself.
    const lengths = await candidates.evaluateAll(els => els.map(el => (el.innerText ?? '').length));
    if (!lengths.length) return null;
    return candidates.nth(lengths.indexOf(Math.min(...lengths)));
}

export async function locate(page, target) {
    let scope = page;
    if (target.row) {
        scope = await innermost(page.locator(ROWS).filter({ hasText: target.row }));
        if (!scope) throw new Error(`no row contains ${JSON.stringify(target.row)}`);
    }
    let found;
    if (target.css) found = scope.locator(target.css);
    else if (target.role) found = scope.getByRole(target.role, target.name === undefined ? {} : { name: target.name, exact: target.exact ?? false });
    else if (target.label) found = scope.getByLabel(target.label, { exact: target.exact ?? false });
    else if (target.placeholder) found = scope.getByPlaceholder(target.placeholder, { exact: target.exact ?? false });
    else if (target.text) found = scope.getByText(target.text, { exact: target.exact ?? false });
    else if (target.row) return scope;
    else throw new Error(`step has no target: ${JSON.stringify(target)}`);
    const count = await found.count();
    if (count === 0) throw new Error('target matches nothing on this screen');
    if (count > 1 && target.nth === undefined && !target.first) throw new Error(`target matches ${count} elements; add "nth", "exact": true or a "row"`);
    return found.nth(target.nth ?? 0);
}

async function centre(locator) {
    const box = await locator.boundingBox();
    if (!box) throw new Error('target has no position on screen');
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function observe(page, state, { withControls = true } = {}) {
    await Promise.all(state.pendingDownloads);
    const seen = await page.evaluate(within => ({
        url: location.pathname + location.search + location.hash,
        pageUrl: location.href,
        // With a region set, only the text inside it: menus and sidebars repeat on every screen.
        text: (within ? [...document.querySelectorAll(within)].map(el => el.innerText).join('\n') : document.body?.innerText ?? '')
            .replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim(),
        storage: Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]))
    }), state.within ?? null).catch(error => ({ url: page.url(), text: '', storage: {}, unreadable: String(error.message).slice(0, 120) }));
    const controls = withControls ? await listControls(page, state.within) : [];
    return {
        ...seen,
        controls,
        errors: [...state.errors],
        requests: [...state.requests],
        downloads: [...state.downloads],
        dialogs: [...state.dialogs],
        blockedHosts: [...state.blockedHosts]
    };
}

async function listControls(page, within = null) {
    const lines = [];
    for (const [selector, role] of KINDS) {
        const group = page.locator(selector);
        const described = await group.evaluateAll((els, within) => els.slice(0, 120).map(el => {
            const tag = el.tagName.toLowerCase();
            const inside = !within || Boolean(el.closest(within));
            const icon = el.querySelector('svg')?.getAttribute('class')?.match(/(?:lucide|icon|fa)-([a-z0-9-]+)/)?.[1];
            const name = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 60);
            const facts = ['required', 'disabled', 'readOnly'].filter(k => el[k]);
            for (const k of ['min', 'max', 'step', 'maxlength', 'pattern', 'accept']) if (el.getAttribute(k)) facts.push(`${k}=${el.getAttribute(k)}`);
            const row = el.closest('tr, li, [role=row], [role=listitem], article');
            return {
                tag,
                ownRole: el.getAttribute('role'),
                type: el.getAttribute('type') ?? (tag === 'input' ? 'text' : null),
                name,
                icon: !name && icon ? icon : null,
                placeholder: el.getAttribute('placeholder'),
                value: 'value' in el && tag !== 'button' && el.value !== '' ? String(el.value).slice(0, 40) : null,
                facts,
                rowText: row ? (row.innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 40) : null,
                inside
            };
        }), within).catch(() => []);
        for (const [index, c] of described.entries()) {
            // Positions count every control, so targets stay valid; only the listing is narrowed.
            if (!c.inside) continue;
            const inputRole = c.ownRole ? c.ownRole : c.tag !== 'input' ? role : { checkbox: 'checkbox', radio: 'radio', number: 'spinbutton', range: 'slider', submit: 'button', button: 'button' }[c.type] ?? 'textbox';
            // Prefer a target that survives rows being added; fall back to position.
            let target = null;
            if (c.name && inputRole && (await page.getByRole(inputRole, { name: c.name, exact: true }).count()) === 1) target = { role: inputRole, name: c.name, exact: true };
            else if (c.placeholder && (await page.getByPlaceholder(c.placeholder, { exact: true }).count()) === 1) target = { placeholder: c.placeholder, exact: true };
            else target = { css: selector, nth: index };
            const what = `${c.tag}${c.type ? '[' + c.type + ']' : ''} ${JSON.stringify(c.name || (c.icon ? 'icon:' + c.icon : c.placeholder ?? ''))}`;
            const extras = [c.value !== null ? `value=${JSON.stringify(c.value)}` : null, c.facts.join(', ') || null, 'nth' in target && c.rowText ? `in row "${c.rowText}"` : null].filter(Boolean);
            lines.push(`${JSON.stringify(target)}  ${what}${extras.length ? '  (' + extras.join('; ') + ')' : ''}`);
        }
    }
    return lines;
}

async function perform(page, step, base, state) {
    const timeout = 4000;
    switch (step.do) {
        case 'goto':
            await page.goto(new URL(step.path ?? '/', base).href, { waitUntil: 'domcontentloaded' });
            break;
        case 'click': {
            const target = await locate(page, step);
            try {
                await target.click({ timeout, clickCount: step.times ?? 1 });
            } catch (error) {
                // A timeout here usually means something covers the control. Say what.
                const cover = await target.evaluate(el => {
                    const box = el.getBoundingClientRect();
                    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
                    if (!top || top === el || el.contains(top)) return null;
                    return `<${top.tagName.toLowerCase()}> "${(top.innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 50)}"`;
                }).catch(() => null);
                throw new Error(cover ? `the control cannot be clicked: ${cover} is on top of it at ${page.viewportSize().width}px wide` : String(error.message).split('\n')[0]);
            }
            break;
        }
        case 'fill':
            await (await locate(page, step)).fill(String(step.value), { timeout });
            break;
        case 'type':
            await (await locate(page, step)).pressSequentially(String(step.value), { timeout: 20_000, delay: step.delay ?? 40 });
            break;
        case 'select':
            await (await locate(page, step)).selectOption(step.option, { timeout });
            break;
        case 'check':
            await (await locate(page, step)).setChecked(step.value ?? true, { timeout });
            break;
        case 'press':
            await page.keyboard.press(step.key);
            break;
        case 'hover':
            await (await locate(page, step)).hover({ timeout });
            break;
        case 'drag': {
            // Real pointer moves in small steps: drag libraries ignore a synthetic drop.
            const from = await centre(await locate(page, step.from));
            const to = await centre(await locate(page, step.to));
            const moves = step.moves ?? 16;
            await page.mouse.move(from.x, from.y);
            await page.mouse.down();
            for (let i = 1; i <= moves; i++) {
                await page.mouse.move(from.x + ((to.x - from.x) * i) / moves, from.y + ((to.y - from.y) * i) / moves);
                await page.waitForTimeout(25);
            }
            // People pause over the drop target before letting go; drag libraries rely on it.
            await page.waitForTimeout(step.hold ?? 300);
            const under = await page.evaluate(({ x, y }) => document.elementsFromPoint(x, y).slice(0, 4).map(el => `<${el.tagName.toLowerCase()}> "${(el.innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 30)}"`).join(' in '), to).catch(() => '?');
            await page.mouse.up();
            state.notes.push(`step ${state.index} drag: grabbed at (${Math.round(from.x)}, ${Math.round(from.y)}), released at (${Math.round(to.x)}, ${Math.round(to.y)}) over ${under}`);
            break;
        }
        case 'upload':
            await (await locate(page, step)).setInputFiles({ name: step.file.name, mimeType: step.file.type ?? 'text/plain', buffer: Buffer.from(step.file.text ?? '', 'utf8') }, { timeout });
            break;
        case 'dialogs':
            state.acceptDialogs = step.accept !== false;
            break;
        case 'reload':
            await page.reload({ waitUntil: 'domcontentloaded' });
            break;
        case 'back':
            await page.goBack({ waitUntil: 'domcontentloaded' });
            break;
        case 'storage':
            await page.evaluate(({ key, value }) => (value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value)), { key: step.key, value: step.value ?? null });
            await page.reload({ waitUntil: 'domcontentloaded' });
            break;
        case 'wait':
            await page.waitForTimeout(Math.min(step.ms ?? 300, 5000));
            break;
        case 'snapshot':
            state.snapshots.push({ name: step.name ?? `after step ${state.index}`, ...(await observe(page, state, { withControls: step.controls === true })) });
            return;
        default:
            throw new Error(`unknown step "${step.do}"`);
    }
    await page.waitForTimeout(step.settle ?? 250);
}

let sharedBrowser = null;
export async function closeBrowser() {
    await sharedBrowser?.close().catch(() => {});
    sharedBrowser = null;
}

// Replays steps and returns the final observation. `keepOpen` leaves the page
// alive for the caller's own checks; the caller must then call `close()`.
export async function replay(baseUrl, steps, env = {}, { screenshot = null, within = null } = {}) {
    if (env.reset) execSync(env.reset, { stdio: 'ignore', timeout: 60_000, shell: '/bin/sh', cwd: env.cwd ?? process.cwd() });
    const base = new URL(baseUrl);
    const allowed = new Set([base.host, ...(env.allowHosts ?? [])]);
    sharedBrowser ??= await chromium.launch();
    const context = await sharedBrowser.newContext({
        viewport: env.viewport ?? { width: 1280, height: 900 },
        acceptDownloads: true,
        ...(env.timezone ? { timezoneId: env.timezone } : {})
    });
    const page = await context.newPage();
    const state = { errors: [], requests: [], downloads: [], dialogs: [], blockedHosts: new Set(), snapshots: [], pendingDownloads: [], notes: [], acceptDialogs: true, index: 0, within };
    page.on('pageerror', e => state.errors.push({ kind: 'uncaught exception', text: String(e.message).split('\n')[0].slice(0, 300) }));
    page.on('console', m => {
        if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) state.errors.push({ kind: 'console error', text: m.text().split('\n')[0].slice(0, 300) });
    });
    page.on('dialog', d => {
        state.dialogs.push({ type: d.type(), message: d.message().slice(0, 160), answered: state.acceptDialogs ? 'accepted' : 'dismissed' });
        (state.acceptDialogs ? d.accept() : d.dismiss()).catch(() => {});
    });
    // Downloads are collected as they happen, so a click never waits for one that is not coming.
    page.on('download', download => {
        state.pendingDownloads.push(
            download.path().then(path => state.downloads.push({ name: download.suggestedFilename(), text: fs.readFileSync(path, 'utf8') })).catch(() => {})
        );
    });
    page.on('response', r => {
        const url = new URL(r.url());
        if (url.host !== base.host || !['fetch', 'xhr'].includes(r.request().resourceType())) return;
        const body = r.request().postData();
        state.requests.push({ method: r.request().method(), path: url.pathname + url.search, status: r.status(), ...(body ? { body: body.slice(0, 400) } : {}) });
        if (r.status() >= 500) state.errors.push({ kind: 'server error', text: `${r.request().method()} ${url.pathname} -> ${r.status()}` });
    });
    await context.route('**/*', route => {
        const host = new URL(route.request().url()).host;
        if (allowed.has(host)) return route.continue();
        state.blockedHosts.add(host);
        return route.abort();
    });

    if (env.cookies) {
        await context.addCookies(String(env.cookies).split(';').map(pair => pair.trim()).filter(Boolean).map(pair => {
            const at = pair.indexOf('=');
            return { name: pair.slice(0, at), value: pair.slice(at + 1), url: base.origin };
        }));
    }
    try {
        if (env.serverClock) {
            // The app's server reads its own clock; the browser's frozen clock does not reach it.
            // env.serverClock is a shell command with {iso} replaced by env.clock, run before the page loads.
            const iso = env.clock ? new Date(env.clock).toISOString() : new Date().toISOString();
            try { execSync(env.serverClock.replaceAll('{iso}', iso), { stdio: 'ignore', timeout: 30_000, shell: '/bin/sh', cwd: env.cwd ?? process.cwd() }); } catch {}
        }
        if (env.clock) await page.clock.install({ time: new Date(env.clock) });
        await page.goto(base.href, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(600);
        let failedStep = null;
        for (const [index, step] of steps.entries()) {
            state.index = index;
            try {
                await perform(page, step, base, state);
            } catch (error) {
                failedStep = { index, step, error: String(error.message).split('\n')[0].slice(0, 200), notRun: steps.length - index - 1 };
                break;
            }
        }
        if (screenshot) await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
        const final = await observe(page, state);
        const cookies = (await context.cookies(base.href)).map(c => `${c.name}=${c.value}`).join('; ');
        return { ...final, snapshots: state.snapshots, notes: state.notes, cookies, failedStep, page, close: () => context.close().catch(() => {}) };
    } catch (error) {
        await context.close().catch(() => {});
        throw error;
    }
}

// A minimal RFC 4180 reader: rows of fields, or null when the text is not valid CSV.
export function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    let afterQuote = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    quoted = false;
                    afterQuote = true;
                }
            } else field += ch;
            continue;
        }
        if (ch === ',' || ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(field);
            field = '';
            afterQuote = false;
            if (ch !== ',') {
                rows.push(row);
                row = [];
            }
            continue;
        }
        if (afterQuote) return null;
        if (ch === '"') {
            if (field !== '') return null;
            quoted = true;
            continue;
        }
        field += ch;
    }
    if (quoted) return null;
    if (field !== '' || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

const CHECKS = ['text_absent', 'text_present', 'count', 'order', 'field', 'no_errors', 'not_blank', 'download_is_csv', 'download_is_json', 'download_contains', 'download_absent', 'request', 'stored', 'js', 'server_alive'];

export function validateExpect(expect) {
    const problems = [];
    if (!Array.isArray(expect) || !expect.length) return ['"expect" must be a non-empty list of checks'];
    for (const check of expect) {
        const [kind, arg] = Object.entries(check)[0] ?? [];
        if (!CHECKS.includes(kind)) problems.push(`unknown check "${kind}" (known: ${CHECKS.join(', ')})`);
        if (kind === 'text_absent' || kind === 'text_present') {
            const pattern = typeof arg === 'string' ? arg : arg?.pattern;
            try {
                new RegExp(pattern, typeof arg === 'object' ? arg.flags ?? '' : '');
            } catch (error) {
                problems.push(`${kind}: ${JSON.stringify(pattern)} is not a JavaScript regular expression (${error.message}). For case-insensitive matching use {"pattern": "...", "flags": "i"}.`);
            }
        }
    }
    return problems;
}

// Returns the checks this observation violates. Needs the live page for the
// checks that look at elements.
export async function violations(observation, expect, controlObservation = null) {
    const failed = [];
    const page = observation.page;
    for (const check of expect) {
        const [[kind, arg]] = Object.entries(check);
        if (kind === 'text_absent' || kind === 'text_present') {
            const pattern = typeof arg === 'string' ? arg : arg.pattern;
            const regex = new RegExp(pattern, typeof arg === 'object' ? arg.flags ?? '' : '');
            const text = typeof arg === 'object' && arg.within
                ? (await page.locator(arg.within).allInnerTexts().catch(() => [])).join('\n')
                : observation.text;
            const where = typeof arg === 'object' && arg.within ? ` within ${arg.within}` : ' on screen';
            if (kind === 'text_absent' && regex.test(text)) failed.push(`text matching /${pattern}/ is${where}`);
            if (kind === 'text_present' && !regex.test(text)) failed.push(`no text matching /${pattern}/${where}`);
        } else if (kind === 'count') {
            const n = await page.locator(arg.css).filter(arg.has_text ? { hasText: arg.has_text } : {}).count();
            if ((arg.equals !== undefined && n !== arg.equals) || (arg.min !== undefined && n < arg.min) || (arg.max !== undefined && n > arg.max))
                failed.push(`${n} element(s) match ${arg.css}${arg.has_text ? ' with text ' + JSON.stringify(arg.has_text) : ''}; expected ${JSON.stringify({ equals: arg.equals, min: arg.min, max: arg.max })}`);
        } else if (kind === 'order') {
            const text = arg.within ? (await page.locator(arg.within).allInnerTexts().catch(() => [])).join('\n') : observation.text;
            const positions = arg.items.map(item => text.indexOf(item));
            if (positions.includes(-1)) failed.push(`not all of ${JSON.stringify(arg.items)} are shown`);
            else if (positions.some((p, i) => i && p < positions[i - 1])) failed.push(`shown in the order ${JSON.stringify([...arg.items].sort((a, b) => text.indexOf(a) - text.indexOf(b)))}, expected ${JSON.stringify(arg.items)}`);
        } else if (kind === 'field') {
            const value = await (await locate(page, arg)).inputValue().catch(error => `<${String(error.message).split('\n')[0].slice(0, 60)}>`);
            if (!new RegExp(arg.matches, arg.flags ?? '').test(value)) failed.push(`the field holds ${JSON.stringify(String(value).slice(0, 80))}, expected to match /${arg.matches}/`);
        } else if (kind === 'stored') {
            const value = observation.storage[arg.key] ?? '';
            if (!new RegExp(arg.matches, arg.flags ?? '').test(value)) failed.push(`saved data under "${arg.key}" does not match /${arg.matches}/`);
        } else if (kind === 'no_errors') {
            const serious = observation.errors.filter(e => e.kind !== 'console error' || arg === 'strict');
            // Errors the control run also has are the app's baseline, not this attack's doing.
            const baseline = new Set((controlObservation?.errors ?? []).map(e => e.kind + e.text));
            const fresh = serious.filter(e => !baseline.has(e.kind + e.text));
            if (fresh.length) failed.push(`errors: ${fresh.map(e => e.kind + ': ' + e.text).join(' | ').slice(0, 240)}`);
        } else if (kind === 'not_blank') {
            if (observation.text.length === 0) failed.push('the page shows no text');
        } else if (kind === 'download_is_csv') {
            const file = observation.downloads.at(-1);
            if (!file) failed.push('nothing was downloaded');
            else {
                const rows = parseCsv(file.text);
                if (!rows) failed.push('the downloaded file is not valid CSV');
                else if (rows.some(r => r.length !== rows[0].length)) failed.push(`CSV rows have different numbers of fields (${[...new Set(rows.map(r => r.length))].join(', ')})`);
                else if (arg?.no_formulas && rows.slice(1).some(r => r.some(f => /^[=+@-](?![\d.]+$)/.test(f)))) failed.push('a CSV field starts with a formula character');
            }
        } else if (kind === 'download_contains' || kind === 'download_absent') {
            const file = observation.downloads.at(-1);
            if (!file) failed.push('nothing was downloaded');
            else {
                const hit = new RegExp(arg).test(file.text);
                if (kind === 'download_contains' && !hit) failed.push(`the downloaded file has no text matching /${arg}/`);
                if (kind === 'download_absent' && hit) failed.push(`the downloaded file contains /${arg}/`);
            }
        } else if (kind === 'server_alive') {
            // The app's own server still answers after the attack. `arg` is a path to GET, default "/".
            const base = new URL(observation.pageUrl);
            const probe = typeof arg === 'string' ? arg : (arg && arg.path) || '/';
            const ok = await fetch(new URL(probe, base).href, { method: 'GET' }).then(r => r.status < 500).catch(() => false);
            if (!ok) failed.push(`the server did not answer ${probe} (it may have crashed)`);
        } else if (kind === 'download_is_json') {
            const file = observation.downloads.at(-1);
            if (!file) failed.push('nothing was downloaded');
            else {
                try {
                    JSON.parse(file.text);
                } catch {
                    failed.push('the downloaded file is not valid JSON');
                }
            }
        } else if (kind === 'request') {
            if (!observation.requests.some(r => new RegExp(arg.path).test(r.path) && (arg.status === undefined || r.status === arg.status))) failed.push(`no request ${arg.path} with status ${arg.status}`);
        } else if (kind === 'js') {
            const ok = await page.evaluate(arg).catch(error => `threw: ${String(error.message).slice(0, 100)}`);
            if (ok !== true) failed.push(`js check not true: ${String(arg).slice(0, 100)} -> ${JSON.stringify(ok)}`);
        }
    }
    return failed;
}
