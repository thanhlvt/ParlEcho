/**
 * fix-group-ids.mjs
 *
 * Reassigns scenario_groups IDs in SQL seed files so that each
 * INSERT INTO scenario_groups gets a unique ID (instead of all
 * scenarios in a group sharing the same group ID).
 *
 * Counter starts at START_ID and increments across all files.
 * Each new ID is applied to the scenario_groups INSERT and to
 * every group_id reference that follows it (until the next
 * scenario_groups INSERT or end of file).
 */

import { readFileSync, writeFileSync } from 'fs';

const FILES = [
  'supabase/seed_office_school.sql',
  'supabase/seed_stressful.sql',
  'supabase/seed_social.sql',
  'supabase/seed_japan_specific.sql',
  'supabase/seed_english_specific.sql',
];

const START_ID = 7;

function makeGroupId(n) {
  return `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
}

let counter = START_ID;

for (const filePath of FILES) {
  const content = readFileSync(filePath, 'utf8');

  // Match each INSERT INTO scenario_groups and capture the current UUID
  const re = /INSERT INTO scenario_groups \([^)]+\) VALUES\s*\n\s*\('([0-9a-f-]+)',/g;

  const matches = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    matches.push({ start: m.index, oldId: m[1], newId: makeGroupId(counter++) });
  }

  if (matches.length === 0) {
    console.log(`⚠  No scenario_groups found in ${filePath} — skipped`);
    continue;
  }

  let result = content;

  // Process from last to first so earlier positions stay valid.
  // UUID lengths are always 36 chars, so replacements never shift positions.
  for (let i = matches.length - 1; i >= 0; i--) {
    const { start, oldId, newId } = matches[i];
    // Section runs from this match to the next one (or end of file)
    const sectionEnd = i + 1 < matches.length ? matches[i + 1].start : content.length;

    const section = result.substring(start, sectionEnd);
    // Replace every quoted occurrence of the old group UUID with the new one
    const updated = section.replaceAll(`'${oldId}'`, `'${newId}'`);
    result = result.substring(0, start) + updated + result.substring(sectionEnd);
  }

  writeFileSync(filePath, result, 'utf8');
  console.log(
    `✓  ${filePath} — ${matches.length} group IDs reassigned (${makeGroupId(counter - matches.length)} … ${makeGroupId(counter - 1)})`,
  );
}

console.log(`\nDone. IDs used: ${makeGroupId(START_ID)} → ${makeGroupId(counter - 1)}`);
