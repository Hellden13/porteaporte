const fs = require('fs');
const path = require('path');

const SITE = 'C:/Users/User/OneDrive/Desktop/Site';

const MAP = {
  '#0a0c10':'var(--brand-bg-dark)',
  '#0a0c0f':'var(--brand-bg-dark)',
  '#090b0f':'var(--brand-bg-dark)',
  '#05080a':'var(--brand-bg-dark)',
  '#070b0f':'var(--brand-bg-dark)',
  '#0d1017':'var(--brand-bg-dark)',
  '#0b0f15':'var(--brand-bg-dark)',
  '#0b0e13':'var(--brand-bg-dark)',
  '#111318':'var(--brand-bg-surface)',
  '#11151c':'var(--brand-bg-surface)',
  '#12151a':'var(--brand-bg-surface)',
  '#0e141c':'var(--brand-bg-surface)',
  '#1a1f28':'var(--brand-bg-surface-light)',
  '#18202a':'var(--brand-bg-surface-light)',
  '#1f242c':'var(--brand-bg-surface-light)',
  '#1e2a38':'var(--brand-bg-surface-light)',
  '#232b28':'var(--brand-bg-surface-light)',
  '#1f2937':'var(--brand-border)',
  '#263241':'var(--brand-border)',
  '#27313a':'var(--brand-border)',
  '#2d3748':'var(--brand-border-light)',
  '#00d9ff':'var(--brand-cyan)',
  '#00c2ff':'var(--brand-cyan)',
  '#00b8d4':'var(--brand-cyan-dark)',
  '#00ff9f':'var(--brand-lime)',
  '#b8f53e':'var(--brand-lime)',
  '#0bffcb':'var(--brand-lime)',
  '#0051ba':'var(--brand-blue-nuit)',
  '#f0f2f5':'var(--brand-text)',
  '#e8eaed':'var(--brand-text)',
  '#f4f7fa':'var(--brand-text)',
  '#f5f0e8':'var(--brand-text)',
  '#a8acb1':'var(--brand-muted)',
  '#9ba1a9':'var(--brand-muted)',
  '#a8b0ba':'var(--brand-muted)',
  '#a0a3a8':'var(--brand-muted)',
  '#6b7280':'var(--brand-muted-dark)',
  '#5a6a7a':'var(--brand-muted-dark)',
  '#8a9490':'var(--brand-muted-dark)',
  '#ef4444':'var(--brand-danger)',
  '#dc2626':'var(--brand-danger)',
  '#ff4d4d':'var(--brand-danger)',
  '#ff6b6b':'var(--brand-danger)',
  '#10b981':'var(--brand-success)',
  '#2ecc71':'var(--brand-success)',
  '#f59e0b':'var(--brand-warning)',
  '#3b82f6':'var(--brand-info)',
  '#60a5fa':'var(--brand-info)',
  '#2e7bff':'var(--brand-blue)',
};

const SKIP_DIRS = ['save', '_archived', 'node_modules'];
const SKIP_FILES = ['cgu.html', 'confidentialite.html'];

function shouldSkip(relPath) {
  const parts = relPath.split(/[/\\]/);
  if (SKIP_DIRS.some(d => parts.includes(d))) return true;
  const basename = parts[parts.length - 1];
  if (SKIP_FILES.includes(basename)) return true;
  if (relPath.includes('assets/design-system.html')) return true;
  return false;
}

function replaceInStyleBlocks(html) {
  return html.replace(/<style([\s\S]*?)>([\s\S]*?)<\/style>/gi, (match, attrs, css) => {
    let updated = css;
    for (const [hex, variable] of Object.entries(MAP)) {
      const escaped = hex.replace('#', '\\#');
      const re = new RegExp(hex, 'gi');
      updated = updated.replace(re, variable);
    }
    return '<style' + attrs + '>' + updated + '</style>';
  });
}

function addBrandUniform(html) {
  if (html.includes('brand-uniform.css')) return html;
  return html.replace('</head>', '  <link rel="stylesheet" href="/assets/brand-uniform.css">\n</head>');
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(SITE, full);
    if (shouldSkip(rel)) continue;
    if (e.isDirectory()) { walk(full); continue; }
    if (!e.name.endsWith('.html')) continue;

    let html = fs.readFileSync(full, 'utf8');
    let updated = addBrandUniform(html);
    updated = replaceInStyleBlocks(updated);

    if (updated !== html) {
      fs.writeFileSync(full, updated, 'utf8');
      console.log('UPDATED: ' + rel);
    } else {
      console.log('ok:      ' + rel);
    }
  }
}

walk(SITE);
console.log('\nTermine.');
