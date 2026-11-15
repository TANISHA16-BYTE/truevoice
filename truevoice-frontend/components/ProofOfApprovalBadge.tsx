"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export async function computeContentHash(text: string): Promise<string> {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const data = new TextEncoder().encode(normalized);
    const buf = await window.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  }
  let h = 0;
  for (let i = 0; i < normalized.length; i++) {
    h = (h * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Pure TypeScript ISO/IEC 18004 QR Code encoder (Byte mode, ECC Level L, Versions 1-9)
const VERSION_SPECS = [
  null,
  { size: 21, dataBytes: 19, ecPerBlock: 7, blocks: [19], align: [] as number[] },
  { size: 25, dataBytes: 34, ecPerBlock: 10, blocks: [34], align: [6, 18] },
  { size: 29, dataBytes: 55, ecPerBlock: 15, blocks: [55], align: [6, 22] },
  { size: 33, dataBytes: 80, ecPerBlock: 20, blocks: [80], align: [6, 26] },
  { size: 37, dataBytes: 108, ecPerBlock: 26, blocks: [108], align: [6, 30] },
  { size: 41, dataBytes: 136, ecPerBlock: 18, blocks: [68, 68], align: [6, 34] },
  { size: 45, dataBytes: 156, ecPerBlock: 20, blocks: [78, 78], align: [6, 22, 38] },
  { size: 49, dataBytes: 194, ecPerBlock: 24, blocks: [97, 97], align: [6, 24, 42] },
  { size: 53, dataBytes: 232, ecPerBlock: 30, blocks: [116, 116], align: [6, 26, 46] },
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let gx = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = gx;
    GF_LOG[gx] = i;
    gx = (gx << 1) ^ (gx & 0x80 ? 0x11d : 0);
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsRemainder(data: number[], degree: number): number[] {
  let gen = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(gen.length + 1).fill(0);
    const factor = GF_EXP[i];
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], factor);
    }
    gen = next;
  }
  const res = new Uint8Array(degree);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0];
    res.copyWithin(0, 1);
    res[degree - 1] = 0;
    for (let j = 0; j < degree; j++) {
      res[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return Array.from(res);
}

function encodeQrMatrix(text: string): number[][] | null {
  const bytes = new TextEncoder().encode(text);
  let version = -1;
  for (let v = 1; v < VERSION_SPECS.length; v++) {
    const spec = VERSION_SPECS[v];
    if (spec && bytes.length + 2 <= spec.dataBytes) {
      version = v;
      break;
    }
  }
  if (version === -1) return null;
  const spec = VERSION_SPECS[version]!;

  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  for (const b of bytes) pushBits(b, 8);
  const maxBits = spec.dataBytes * 8;
  pushBits(0, Math.min(4, maxBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const padBytes = [0xec, 0x11];
  let pi = 0;
  while (bits.length < maxBits) {
    pushBits(padBytes[pi % 2], 8);
    pi++;
  }

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }

  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  for (const bLen of spec.blocks) {
    const slice = codewords.slice(offset, offset + bLen);
    offset += bLen;
    dataBlocks.push(slice);
    ecBlocks.push(rsRemainder(slice, spec.ecPerBlock));
  }

  const interleaved: number[] = [];
  const maxD = Math.max(...spec.blocks);
  for (let i = 0; i < maxD; i++) {
    for (const blk of dataBlocks) if (i < blk.length) interleaved.push(blk[i]);
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const blk of ecBlocks) interleaved.push(blk[i]);
  }

  const finalBits: number[] = [];
  for (const cw of interleaved) {
    for (let i = 7; i >= 0; i--) finalBits.push((cw >> i) & 1);
  }

  const size = spec.size;
  const base = Array.from({ length: size }, () => Array<number>(size).fill(0));
  const isFunc = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const setFunc = (r: number, c: number, dark: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      base[r][c] = dark ? 1 : 0;
      isFunc[r][c] = true;
    }
  };

  const drawFinder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inSep = dr === -1 || dr === 7 || dc === -1 || dc === 7;
        const dark =
          !inSep &&
          (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        setFunc(r, c, dark);
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    setFunc(6, i, i % 2 === 0);
    setFunc(i, 6, i % 2 === 0);
  }
  setFunc(size - 8, 8, true);

  for (const ar of spec.align) {
    for (const ac of spec.align) {
      if ((ar === 6 && ac === 6) || (ar === 6 && ac === size - 7) || (ar === size - 7 && ac === 6)) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          setFunc(ar + dr, ac + dc, dist === 2 || dist === 0);
        }
      }
    }
  }

  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      setFunc(8, i, false);
      setFunc(i, 8, false);
    }
  }
  for (let i = 0; i < 8; i++) setFunc(8, size - 1 - i, false);
  for (let i = 0; i < 7; i++) setFunc(size - 1 - i, 8, false);

  if (version >= 7) {
    let rem = version << 12;
    for (let i = 17; i >= 12; i--) if ((rem >> i) & 1) rem ^= 0x1f25 << (i - 12);
    const vBits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((vBits >> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = size - 11 + (i % 3);
      setFunc(a, b, bit);
      setFunc(b, a, bit);
    }
  }

  let bitIdx = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (let dx = 0; dx < 2; dx++) {
        const c = right - dx;
        if (!isFunc[r][c]) {
          base[r][c] = bitIdx < finalBits.length ? finalBits[bitIdx++] : 0;
        }
      }
    }
    upward = !upward;
  }

  const maskFn: ((r: number, c: number) => boolean)[] = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  let bestGrid: number[][] = base;
  let bestScore = Infinity;

  for (let m = 0; m < 8; m++) {
    const grid = base.map((row, r) =>
      row.map((v, c) => (!isFunc[r][c] && maskFn[m](r, c) ? v ^ 1 : v))
    );

    const fmtData = (0b01 << 3) | m;
    let rem = fmtData << 10;
    for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
    const fmt = ((fmtData << 10) | rem) ^ 0x5412;

    for (let i = 0; i <= 5; i++) grid[8][i] = (fmt >> (14 - i)) & 1;
    grid[8][7] = (fmt >> 8) & 1;
    grid[8][8] = (fmt >> 7) & 1;
    grid[7][8] = (fmt >> 6) & 1;
    for (let i = 0; i <= 5; i++) grid[5 - i][8] = (fmt >> (5 - i)) & 1;

    for (let i = 0; i <= 6; i++) grid[size - 1 - i][8] = (fmt >> (14 - i)) & 1;
    for (let i = 0; i <= 7; i++) grid[8][size - 8 + i] = (fmt >> (7 - i)) & 1;

    let score = 0;
    for (let r = 0; r < size; r++) {
      let run = 1;
      for (let c = 1; c < size; c++) {
        if (grid[r][c] === grid[r][c - 1]) {
          run++;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else {
          run = 1;
        }
      }
    }
    for (let c = 0; c < size; c++) {
      let run = 1;
      for (let r = 1; r < size; r++) {
        if (grid[r][c] === grid[r - 1][c]) {
          run++;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else {
          run = 1;
        }
      }
    }
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const s = grid[r][c] + grid[r][c + 1] + grid[r + 1][c] + grid[r + 1][c + 1];
        if (s === 0 || s === 4) score += 3;
      }
    }
    if (score < bestScore) {
      bestScore = score;
      bestGrid = grid;
    }
  }
  return bestGrid;
}

interface ProofOfApprovalBadgeProps {
  badgeCode: string;
  title: string;
  approvedBy: string;
  approvedAt: string;
  approvedContent: string;
}

export function ProofOfApprovalBadge({
  badgeCode,
  title,
  approvedBy,
  approvedAt,
  approvedContent,
}: ProofOfApprovalBadgeProps) {
  const [approvedHash, setApprovedHash] = useState<string>("calculating...");
  const [pastedText, setPastedText] = useState<string>("");
  const [pastedHash, setPastedHash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    computeContentHash(approvedContent).then(setApprovedHash);
  }, [approvedContent]);

  useEffect(() => {
    if (!pastedText.trim()) {
      setPastedHash(null);
      return;
    }
    computeContentHash(pastedText).then(setPastedHash);
  }, [pastedText]);

  const verifyPath = `/verify/${badgeCode}`;
  const shortUrl = origin ? `${origin}${verifyPath}` : verifyPath;
  const isLocalhost = origin.includes("localhost") || origin.includes("127.0.0.1");

  const qrMatrix = useMemo(
    () => encodeQrMatrix(shortUrl) ?? encodeQrMatrix(verifyPath),
    [shortUrl, verifyPath]
  );

  const matches = pastedHash !== null && pastedHash === approvedHash;

  function copyLink() {
    navigator.clipboard?.writeText(shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const qrSize = qrMatrix ? qrMatrix.length + 8 : 37;

 return (
    <div className="animate-pop-in rounded-2xl border-2 border-[#1f6b3a]/40 bg-white p-4 shadow-md sm:p-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ddebdd] px-3 py-1 text-xs font-bold text-[#1f6b3a]">
            &#10003; PROOF OF APPROVAL
          </span>
          <h3 className="mt-2 break-words font-serif text-lg font-semibold text-[var(--tv-ink)] sm:text-xl">
            {title}
          </h3>
          <p className="mt-1 text-xs text-[var(--tv-muted)]">
            Approved by <strong className="text-[var(--tv-ink)]">{approvedBy}</strong> &middot;{" "}
            {approvedAt}
          </p>
          <p className="mt-1 break-all font-mono text-[11px] text-[var(--tv-muted)]">
            Fingerprint: {approvedHash}
          </p>
        </div>

        {/* Real Scannable & Clickable QR Code */}
        <Link
          href={verifyPath}
          target="_blank"
          title={`Open ${verifyPath}`}
          className="flex w-full shrink-0 flex-col items-center rounded-xl border border-[var(--tv-line)] bg-white p-2.5 transition hover:border-[var(--tv-brand)] hover:shadow-sm sm:w-auto"
        >
          {qrMatrix && (
            <svg
              className="h-24 w-24"
              viewBox={`0 0 ${qrSize} ${qrSize}`}
              shapeRendering="crispEdges"
              role="img"
              aria-label={`QR code for ${shortUrl}`}
            >
              <rect width={qrSize} height={qrSize} fill="#ffffff" />
              {qrMatrix.map((row, r) =>
                row.map((cell, c) =>
                  cell === 1 ? (
                    <rect
                      key={`${r}-${c}`}
                      x={c + 4}
                      y={r + 4}
                      width={1}
                      height={1}
                      fill="#111827"
                    />
                  ) : null
                )
              )}
            </svg>
          )}
          <span className="mt-1 font-mono text-[10px] font-semibold text-[var(--tv-brand)]">
            {badgeCode}
          </span>
          <span className="text-[10px] text-[var(--tv-muted)]">Click or scan</span>
        </Link>
      </div>

      {/* Short Link */}
      <div className="mt-4 flex flex-col gap-2 rounded-xl bg-[var(--tv-paper)] px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={verifyPath}
          target="_blank"
          className="min-w-0 flex-1 truncate font-mono text-[var(--tv-ink)] underline"
        >
          {shortUrl}
        </Link>
        <button
          type="button"
          onClick={copyLink}
          className="w-full shrink-0 rounded-lg bg-[var(--tv-brand)] px-3 py-1.5 font-semibold text-white transition hover:bg-[var(--tv-brand-ink)] active:scale-95 sm:w-auto sm:py-1"
        >
          {copied ? "Copied!" : "Copy short link"}
        </button>
      </div>

      {isLocalhost && (
        <p className="mt-2 text-[11px] text-[var(--tv-muted)]">
          Note: Because you&apos;re running on <code>localhost</code>, a phone camera can&apos;t open{" "}
          <code>localhost:3000</code> directly — click the QR code or short link on your laptop, or open the app via your deployed URL / local Wi-Fi IP to scan from a phone.
        </p>
      )}

      {/* Paste-to-Compare Integrity Check */}
      <div className="mt-4 border-t border-[var(--tv-line)] pt-4">
        <label htmlFor={`verify-${badgeCode}`} className="block text-xs font-semibold">
          Verify published text (paste to check if content changed since approval):
        </label>
        <textarea
          id={`verify-${badgeCode}`}
          rows={2}
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          placeholder="Paste the live post or ad text here to compare..."
          className="mt-1.5 w-full rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/50 p-2.5 text-xs outline-none focus:border-[var(--tv-brand)]"
        />
        {pastedHash !== null && (
          <div
            role="status"
            className={`animate-pop-in mt-2 rounded-xl px-3 py-2 text-xs font-semibold ${
              matches
                ? "border border-[#1f6b3a]/30 bg-[#ddebdd] text-[#1f6b3a]"
                : "border border-[#9b1c13]/30 bg-[#f9ddd9] text-[#9b1c13]"
            }`}
          >
            {matches
              ? "✓ Exact match! This text has NOT been changed since approval."
              : "⚠ Warning: Content differs from the approved version (hash mismatch)."}
          </div>
        )}
      </div>
    </div>
  );
}