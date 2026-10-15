#!/usr/bin/env node
// PDP Demo Generator — PI Marketing (command line)
// Gebruik: node generate.js configs/<prospect>.json
// De webversie staat in public/ + netlify/ (zie README); de kern zit in lib/run.js.
const fs = require('fs');
const path = require('path');
const { runDemo, slugify } = require('./lib/run');
const { launchBrowser } = require('./lib/browser');

const configPath = process.argv[2];
if (!configPath) { console.error('Gebruik: node generate.js configs/<prospect>.json'); process.exit(1); }
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const outDir = path.join(__dirname, 'output', slugify(config.name));

runDemo(config, { outDir, launchBrowser })
  .then(() => console.log(`\n✔ Klaar — alles staat in ${path.relative(process.cwd(), outDir)}/`))
  .catch(err => { console.error(err); process.exit(1); });
