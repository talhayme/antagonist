// First-run setup, so the skill works right after `npx skills add`: installs
// this folder's dependencies and the browser it drives, once. Imports nothing
// outside Node itself, because it runs before those dependencies exist.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const here = new URL('.', import.meta.url).pathname;
const say = message => process.stderr.write(`antagonist: ${message}\n`);

function run(command, what) {
    say(`${what} (first run only, about a minute)...`);
    try {
        execSync(command, { cwd: here, stdio: ['ignore', 'ignore', 'inherit'], timeout: 600_000 });
    } catch {
        say(`could not ${what.toLowerCase()}. Run this yourself in ${here}:\n  ${command}`);
        process.exit(3);
    }
}

if (!fs.existsSync(new URL('./node_modules/playwright/package.json', import.meta.url))) {
    run('npm install --no-audit --no-fund --loglevel=error', 'Installing dependencies');
}

// The skill runs the browser headless, so the small headless shell is enough.
// A full Chromium that is already installed works too; launching is the only reliable check.
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
async function canLaunch() {
    try {
        const browser = await chromium.launch();
        await browser.close();
        return true;
    } catch {
        return false;
    }
}
if (!fs.existsSync(chromium.executablePath()) && !(await canLaunch())) {
    run('npx --no-install playwright install --only-shell chromium', 'Downloading the browser');
}
