/**
 * scripts/generate-scenarios-sql.mjs
 *
 * Đọc file JSON kịch bản hội thoại và tạo ra SQL INSERT để import vào Supabase.
 *
 * Cách dùng:
 *   node scripts/generate-scenarios-sql.mjs <file.json> [file2.json ...] [--out output.sql]
 *
 * Ví dụ:
 *   node scripts/generate-scenarios-sql.mjs scripts/scenarios/daily-life/01_phone-restaurant-reservation.json
 *   node scripts/generate-scenarios-sql.mjs scripts/scenarios/**\/*.json --out supabase/seed_generated.sql
 *
 * Format JSON đầu vào: xem scripts/scenarios/daily-life/01_phone-restaurant-reservation.json
 *
 * SQL đầu ra:
 *   - scenario_groups : INSERT ... ON CONFLICT (id) DO NOTHING
 *   - scenarios       : INSERT ... ON CONFLICT (id) DO NOTHING
 *   - scenario_lines  : DELETE rồi INSERT (idempotent — an toàn chạy lại)
 */

import { readFileSync, writeFileSync } from 'fs';
import { basename, resolve } from 'path';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Escape string cho SQL: wrap trong dấu nháy đơn, double các dấu ' bên trong */
function esc(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Indent mỗi dòng trong block */
function indent(str, spaces = 2) {
  return str
    .split('\n')
    .map((l) => ' '.repeat(spaces) + l)
    .join('\n');
}

// ── SQL generator ─────────────────────────────────────────────────────────────

function generateSql(data, sourceFile) {
  const { group, sort_order, icon, level, type, scenarios } = data;

  // Validate
  if (!group?.id || !group?.slug || !group?.category) {
    throw new Error(`${sourceFile}: thiếu trường group.id / group.slug / group.category`);
  }
  if (!scenarios || Object.keys(scenarios).length === 0) {
    throw new Error(`${sourceFile}: không có scenarios`);
  }

  const lines = [];

  lines.push(`-- ${'─'.repeat(70)}`);
  lines.push(`-- Source : ${sourceFile}`);
  lines.push(`-- Group  : ${group.slug}  (${group.category})`);
  lines.push(`-- Langs  : ${Object.keys(scenarios).join(', ')}`);
  lines.push(`-- ${'─'.repeat(70)}`);
  lines.push('');

  // ── scenario_groups ─────────────────────────────────────────────────────
  lines.push('-- scenario_groups');
  lines.push(`INSERT INTO scenario_groups (id, slug, category) VALUES`);
  lines.push(`  (${esc(group.id)}, ${esc(group.slug)}, ${esc(group.category)})`);
  lines.push(`ON CONFLICT (id) DO NOTHING;`);
  lines.push('');

  // ── scenarios ───────────────────────────────────────────────────────────
  lines.push('-- scenarios');
  const scenarioEntries = Object.entries(scenarios);

  const scenarioRows = scenarioEntries.map(([langId, sc]) => {
    if (!sc.id || !sc.title) {
      throw new Error(`${sourceFile}[${langId}]: thiếu trường id / title`);
    }
    return [
      `  (`,
      `    ${esc(sc.id)},`,
      `    ${esc(group.id)},`,
      `    ${esc(langId)},`,
      `    ${esc(sc.title)},`,
      `    ${esc(sc.description ?? '')},`,
      `    ${esc(level ?? 'beginner')}, ${esc(type ?? 'scripted')}, ${esc(icon ?? '💬')}, ${sort_order ?? 1}`,
      `  )`,
    ].join('\n');
  });

  lines.push(
    `INSERT INTO scenarios (id, group_id, language_id, title, description, level, type, icon, sort_order) VALUES`,
  );
  lines.push(scenarioRows.join(',\n'));
  lines.push(`ON CONFLICT (id) DO NOTHING;`);
  lines.push('');

  // ── scenario_lines ──────────────────────────────────────────────────────
  for (const [langId, sc] of scenarioEntries) {
    const hasReadingAids = sc.lines?.some((l) => l.furigana || l.romaji);
    const colList = hasReadingAids
      ? '(scenario_id, language_id, sort_order, speaker, text, translation, furigana, romaji)'
      : '(scenario_id, language_id, sort_order, speaker, text, translation)';

    lines.push(`-- scenario_lines: ${langId} — ${sc.title}`);
    lines.push(`DELETE FROM scenario_lines WHERE scenario_id = ${esc(sc.id)};`);

    if (!sc.lines?.length) {
      lines.push('-- (no lines)');
      lines.push('');
      continue;
    }

    const lineRows = sc.lines.map((l) => {
      const cols = [
        esc(sc.id),
        esc(langId),
        Number(l.sort_order),
        esc(l.speaker),
        esc(l.text),
        esc(l.translation),
      ];
      if (hasReadingAids) {
        cols.push(esc(l.furigana ?? null));
        cols.push(esc(l.romaji ?? null));
      }
      return `  (${cols.join(', ')})`;
    });

    lines.push(`INSERT INTO scenario_lines ${colList} VALUES`);
    lines.push(lineRows.join(',\n') + ';');
    lines.push('');
  }

  return lines.join('\n');
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help') {
  console.error(
    [
      'Cách dùng:',
      '  node scripts/generate-scenarios-sql.mjs <file.json> [file2.json ...] [--out output.sql]',
      '',
      'Ví dụ:',
      '  node scripts/generate-scenarios-sql.mjs scripts/scenarios/daily-life/01_phone-restaurant-reservation.json',
      '  node scripts/generate-scenarios-sql.mjs scripts/scenarios/**/*.json --out supabase/seed_generated.sql',
    ].join('\n'),
  );
  process.exit(args[0] === '--help' ? 0 : 1);
}

const outFlagIdx = args.indexOf('--out');
const outFile = outFlagIdx !== -1 ? args[outFlagIdx + 1] : null;
const inputFiles = args.filter(
  (a, i) => a !== '--out' && (outFlagIdx === -1 || i !== outFlagIdx + 1),
);

if (inputFiles.length === 0) {
  console.error('Lỗi: không có file JSON đầu vào.');
  process.exit(1);
}

const parts = [
  `-- ${'='.repeat(72)}`,
  `-- Auto-generated by generate-scenarios-sql.mjs`,
  `-- ${new Date().toISOString()}`,
  `-- ${'='.repeat(72)}`,
  '',
];

let hasError = false;
for (const file of inputFiles) {
  const filePath = resolve(file);
  let data;
  try {
    data = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.error(`Lỗi đọc/parse ${file}: ${e.message}`);
    hasError = true;
    continue;
  }
  try {
    parts.push(generateSql(data, basename(filePath)));
  } catch (e) {
    console.error(`Lỗi generate SQL từ ${file}: ${e.message}`);
    hasError = true;
  }
}

if (hasError) process.exit(1);

const output = parts.join('\n');

if (outFile) {
  writeFileSync(resolve(outFile), output, 'utf-8');
  console.log(`✓ Đã ghi ${inputFiles.length} file → ${outFile}`);
} else {
  process.stdout.write(output);
}
