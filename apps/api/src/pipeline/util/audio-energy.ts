import { promises as fs } from 'node:fs';

/**
 * Compute a per-second, peak-normalized RMS energy envelope from a PCM WAV file
 * (the 16k mono WAV extracted by ffmpeg). Pure JS — no native deps — so it works
 * even when the Python ai-service is down. Returns [] on any parse issue.
 */
export async function computeEnergyEnvelope(
  wavPath: string,
): Promise<{ sampleRate: number; energy: number[] }> {
  try {
    const buf = await fs.readFile(wavPath);
    if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') {
      return { sampleRate: 16000, energy: [] };
    }

    // Walk chunks to find 'fmt ' and 'data'.
    let offset = 12;
    let sampleRate = 16000;
    let channels = 1;
    let bits = 16;
    let dataStart = -1;
    let dataLen = 0;
    while (offset + 8 <= buf.length) {
      const id = buf.toString('ascii', offset, offset + 4);
      const size = buf.readUInt32LE(offset + 4);
      const body = offset + 8;
      if (id === 'fmt ') {
        channels = buf.readUInt16LE(body + 2);
        sampleRate = buf.readUInt32LE(body + 4);
        bits = buf.readUInt16LE(body + 14);
      } else if (id === 'data') {
        dataStart = body;
        dataLen = size;
        break;
      }
      offset = body + size + (size % 2);
    }
    if (dataStart < 0 || bits !== 16) return { sampleRate, energy: [] };

    const bytesPerSample = 2 * channels;
    const samplesPerSec = sampleRate;
    const end = Math.min(buf.length, dataStart + dataLen);
    const perSecond: number[] = [];
    let sumSq = 0;
    let count = 0;
    let secondSamples = 0;
    for (let i = dataStart; i + 1 < end; i += bytesPerSample) {
      const s = buf.readInt16LE(i) / 32768;
      sumSq += s * s;
      count++;
      secondSamples++;
      if (secondSamples >= samplesPerSec) {
        perSecond.push(Math.sqrt(sumSq / Math.max(1, count)));
        sumSq = 0;
        count = 0;
        secondSamples = 0;
      }
    }
    if (count > 0) perSecond.push(Math.sqrt(sumSq / count));

    const peak = Math.max(1e-6, ...perSecond);
    return { sampleRate, energy: perSecond.map((v) => Math.min(1, v / peak)) };
  } catch {
    return { sampleRate: 16000, energy: [] };
  }
}
