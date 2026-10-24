import { mkdir, lstat, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WORKSPACE_DIR } from './paths.ts';
import { isSafeFileName } from './policy.ts';

/**
 * PoC-only idempotent file creation. Deliberately refuses to overwrite:
 *  - existing files with other contents
 *  - symlinks / non-regular files
 *  - files outside the fixed workspace
 * This is not a general-purpose OS sandbox or atomic transaction journal.
 */
export async function writeOnce(fileName: string, content: string): Promise<'created' | 'already_exists'> {
  if (!isSafeFileName(fileName)) throw new Error('Unsafe filename');
  await mkdir(WORKSPACE_DIR, { recursive: true });
  const dir = await lstat(WORKSPACE_DIR);
  if (!dir.isDirectory() || dir.isSymbolicLink()) throw new Error('Unsafe workspace root');

  const filePath = join(WORKSPACE_DIR, fileName);
  let handle;
  try {
    handle = await open(filePath, 'wx', 0o600);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    const existing = await lstat(filePath);
    if (!existing.isFile() || existing.isSymbolicLink()) throw new Error('Existing target is not a regular file');
    const existingContents = await readFile(filePath, 'utf8');
    if (existingContents !== content) throw new Error('Existing file content differs; refusing to overwrite');
    return 'already_exists';
  }
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  return 'created';
}
