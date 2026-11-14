import { readFile } from 'node:fs/promises';
import { mapLegacyArchive } from '../site/studio-migration.js';
import { testArchive, testMapping } from '../site/studio-fixture.js';
import { workshopMigrationReport } from '../site/workshop-migration-report.js';

const [source] = process.argv.slice(2);
if (!source) {
  console.error('用法：node scripts/preview-workshop-migration.mjs <Studio 导出.json | --fixture>');
  process.exitCode = 1;
} else {
  const snapshot = source === '--fixture' ? mapLegacyArchive(testArchive, testMapping).transfer :
    JSON.parse(await readFile(source, 'utf8'));
  process.stdout.write(JSON.stringify(workshopMigrationReport(snapshot), null, 2) + '\n');
}
