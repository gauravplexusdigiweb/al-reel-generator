import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';

/**
 * Pick a source file for analysis/rendering: the first available rendition from
 * `prefer` (by label), else any rendition, else the original upload.
 */
export async function pickRendition(
  prisma: PrismaService,
  storage: StorageService,
  videoId: string,
  originalRelPath: string,
  prefer: string[],
): Promise<string> {
  const rends = await prisma.videoRendition.findMany({ where: { videoId } });
  for (const label of prefer) {
    const r = rends.find((x) => x.label === label);
    if (r) return storage.abs(r.path);
  }
  if (rends.length) return storage.abs(rends[0].path);
  return storage.abs(originalRelPath);
}
