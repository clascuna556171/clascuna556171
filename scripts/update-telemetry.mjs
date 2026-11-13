import fs from 'node:fs';
import path from 'node:path';

const USERNAME = 'clascuna556171';
const OUT_DIR = path.resolve(process.cwd(), 'assets');
fs.mkdirSync(OUT_DIR, { recursive: true });

const THEMES = {
  light: {
    cardBg: '#F8F6F0',
    cardGradEnd: '#F1EDE3',
    ink: '#191817',
    inkMuted: '#46423B',
    inkFaint: '#726C62',
    hairline: '#DDD7CA',
    hairlineStrong: '#C2BBAE',
    shadow: 'rgba(25, 24, 23, 0.085)',
    grain: 'rgba(25, 24, 23, 0.048)',
    levels: ['#ECE7DC', '#B8B1A4', '#867F73', '#4E4A43', '#191817'],
  },
  dark: {
    cardBg: '#141619',
    cardGradEnd: '#0F1114',
    ink: '#ECEDEA',
    inkMuted: '#ACB0B8',
    inkFaint: '#7D828C',
    hairline: '#242830',
    hairlineStrong: '#383D47',
    shadow: 'rgba(0, 0, 0, 0.55)',
    grain: 'rgba(236, 237, 234, 0.032)',
    levels: ['#1D2026', '#454A54', '#727885', '#A9AFB9', '#ECEDEA'],
  },
};

const FONT_SERIF = "Georgia, 'Times New Roman', Didot, 'Bodoni MT', serif";
const FONT_MONO = "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";

function formatShortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${months[m - 1]} ${String(d).padStart(2, '0')}, ${y}`;
}

async function fetchContributions() {
  const res = await fetch(`https://github.com/users/${USERNAME}/contributions`, {
    headers: { 'User-Agent': 'stxic-telemetry-updater' },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch GitHub contributions: HTTP ${res.status}`);
  }
  const html = await res.text();

  const headerMatch = html.match(/([0-9,]+)\s+contributions?\s+in\s+the\s+last\s+year/i);
  const totalContributions = headerMatch ? headerMatch[1] : '0';

  const dayMap = new Map();
  for (const match of html.matchAll(/data-date="([0-9]{4}-[0-9]{2}-[0-9]{2})"[^>]*data-level="([0-4])"/g)) {
    dayMap.set(match[1], Number(match[2]));
  }

  const days = [...dayMap.entries()]
    .map(([date, level]) => ({ date, level }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (days.length === 0) {
    throw new Error('Parsed 0 contribution days from GitHub contributions HTML');
  }

  // Compute longest streak across the 365-day window
  let longest = { count: 0, start: days[0].date, end: days[0].date };
  let run = { count: 0, start: '', end: '' };

  for (const day of days) {
    if (day.level > 0) {
      if (run.count === 0) {
        run.start = day.date;
      }
      run.count += 1;
      run.end = day.date;
      if (run.count >= longest.count) {
        longest = { ...run };
      }
    } else {
      run = { count: 0, start: '', end: '' };
    }
  }

  // Compute current streak (allowing today to be 0 if yesterday was active)
  let idx = days.length - 1;
  if (days[idx].level === 0 && idx > 0 && days[idx - 1].level > 0) {
    idx -= 1;
  }

  let current = { count: 0, start: days[idx].date, end: days[idx].date };
  while (idx >= 0 && days[idx].level > 0) {
    current.count += 1;
    current.start = days[idx].date;
    idx -= 1;
  }

  const activeDays = days.filter((d) => d.level > 0).length;

  return {
    totalContributions,
    activeDays,
    windowStart: days[0].date,
    windowEnd: days[days.length - 1].date,
    current,
    longest,
    days,
  };
}

function buildTelemetrySvg(mode, data) {
  const t = THEMES[mode];

  // Build 53x7 monochrome matrix cells aligned cleanly to x=48..1152 (width 1104)
  // 53 cols * 20.8px pitch -> square 14x14px (gap ~6.8px) -> total span 52*20.8 + 14 = 1095.6px
  const firstDow = new Date(`${data.days[0].date}T00:00:00Z`).getUTCDay();
  const cells = [];
  const startX = 48;
  const startY = 186;
  const pitchX = 20.6;
  const pitchY = 13.5;

  data.days.forEach((day, i) => {
    const slot = firstDow + i;
    const col = Math.floor(slot / 7);
    const row = slot % 7;
    const x = (startX + col * pitchX).toFixed(1);
    const y = (startY + row * pitchY).toFixed(1);
    const fill = t.levels[day.level];
    cells.push(`<rect x="${x}" y="${y}" width="10" height="10" rx="2" fill="${fill}"/>`);
  });

  const currLabel = data.current.count === 1 ? 'DAY' : 'DAYS';
  const longLabel = data.longest.count === 1 ? 'DAY' : 'DAYS';
  const currRange =
    data.current.count > 0
      ? `${formatShortDate(data.current.start)} — ${formatShortDate(data.current.end)}`
      : 'NO ACTIVE STREAK';
  const longRange =
    data.longest.count > 0
      ? `${formatShortDate(data.longest.start)} — ${formatShortDate(data.longest.end)}`
      : '—';
  const totalRange = `${formatShortDate(data.windowStart)} — ${formatShortDate(data.windowEnd)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="306" viewBox="0 0 1200 306" role="img" aria-label="GitHub Activity and Streak Telemetry: ${data.totalContributions} contributions, ${data.current.count} day current streak, ${data.longest.count} day longest streak">
  <defs>
    <linearGradient id="tBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${t.cardBg}"/>
      <stop offset="100%" stop-color="${t.cardGradEnd}"/>
    </linearGradient>
    <linearGradient id="tScan" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${t.ink}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${t.ink}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${t.ink}" stop-opacity="0"/>
    </linearGradient>
    <pattern id="tGrain" width="12" height="12" patternUnits="userSpaceOnUse">
      <circle cx="3" cy="3" r="0.55" fill="${t.grain}"/>
      <circle cx="9" cy="9" r="0.45" fill="${t.grain}"/>
    </pattern>
    <clipPath id="tClip">
      <rect x="10" y="10" width="1180" height="284" rx="5"/>
    </clipPath>
    <style>
      .ring-pulse { transform-origin: 600px 118px; animation: ringBreath 4.2s ease-in-out infinite; }
      .dot-live { animation: dotBlink 2.6s ease-in-out infinite; }
      .t-scan { animation: scanSlide 8s ease-in-out infinite; }
      @keyframes ringBreath {
        0%, 100% { opacity: 0.35; transform: scale(0.98); }
        50% { opacity: 0.9; transform: scale(1.03); }
      }
      @keyframes dotBlink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.28; }
      }
      @keyframes scanSlide {
        0%, 100% { transform: translateX(-180px); opacity: 0; }
        50% { transform: translateX(920px); opacity: 0.85; }
      }
      @media (prefers-reduced-motion: reduce) {
        .ring-pulse, .dot-live, .t-scan { animation: none !important; }
      }
    </style>
  </defs>

  <rect x="14" y="16" width="1176" height="282" rx="5" fill="${t.shadow}"/>
  <g clip-path="url(#tClip)">
    <rect x="10" y="10" width="1180" height="284" rx="5" fill="url(#tBg)"/>
    <rect x="10" y="10" width="1180" height="284" fill="url(#tGrain)"/>
  </g>
  <rect x="10" y="10" width="1180" height="284" rx="5" fill="none" stroke="${t.hairlineStrong}" stroke-width="1"/>

  <!-- Header -->
  <circle class="dot-live" cx="51" cy="42.5" r="2.8" fill="${t.ink}"/>
  <text x="64" y="46" font-family="${FONT_MONO}" font-size="11.5" letter-spacing="2.2" fill="${t.ink}">04 // ACTIVITY &amp; STREAK TELEMETRY</text>
  <text x="1152" y="46" text-anchor="end" font-family="${FONT_MONO}" font-size="10.5" letter-spacing="1.6" fill="${t.inkFaint}">ROLLING 365D  &#8226;  ${data.activeDays} ACTIVE DAYS</text>

  <line x1="48" y1="62" x2="1152" y2="62" stroke="${t.hairline}" stroke-width="1"/>
  <rect class="t-scan" x="48" y="61" width="160" height="2" fill="url(#tScan)"/>

  <!-- 3-Column Metrics -->
  <line x1="408" y1="78" x2="408" y2="158" stroke="${t.hairline}" stroke-width="0.9"/>
  <line x1="792" y1="78" x2="792" y2="158" stroke="${t.hairline}" stroke-width="0.9"/>

  <!-- Column 1: Total Contributions -->
  <g transform="translate(228, 92)">
    <text x="0" y="0" text-anchor="middle" font-family="${FONT_MONO}" font-size="10.5" letter-spacing="2" fill="${t.inkFaint}">TOTAL CONTRIBUTIONS</text>
    <text x="0" y="38" text-anchor="middle" font-family="${FONT_SERIF}" font-size="38" font-weight="400" fill="${t.ink}">${data.totalContributions}</text>
    <text x="0" y="60" text-anchor="middle" font-family="${FONT_MONO}" font-size="10" letter-spacing="1.2" fill="${t.inkMuted}">${totalRange}</text>
  </g>

  <!-- Column 2: Current Streak (Center Hero) -->
  <g>
    <rect class="ring-pulse" x="476" y="75" width="248" height="86" rx="4" fill="none" stroke="${t.hairlineStrong}" stroke-width="1"/>
    <g transform="translate(600, 92)">
      <text x="0" y="0" text-anchor="middle" font-family="${FONT_MONO}" font-size="10.5" font-weight="600" letter-spacing="2.2" fill="${t.ink}">CURRENT STREAK</text>
      <text x="0" y="38" text-anchor="middle" font-family="${FONT_SERIF}" font-size="38" font-weight="400" fill="${t.ink}">${data.current.count} ${currLabel}</text>
      <text x="0" y="60" text-anchor="middle" font-family="${FONT_MONO}" font-size="10" letter-spacing="1.2" fill="${t.inkMuted}">${currRange}</text>
    </g>
  </g>

  <!-- Column 3: Longest Streak -->
  <g transform="translate(972, 92)">
    <text x="0" y="0" text-anchor="middle" font-family="${FONT_MONO}" font-size="10.5" letter-spacing="2" fill="${t.inkFaint}">LONGEST STREAK (365D)</text>
    <text x="0" y="38" text-anchor="middle" font-family="${FONT_SERIF}" font-size="38" font-weight="400" fill="${t.ink}">${data.longest.count} ${longLabel}</text>
    <text x="0" y="60" text-anchor="middle" font-family="${FONT_MONO}" font-size="10" letter-spacing="1.2" fill="${t.inkMuted}">${longRange}</text>
  </g>

  <line x1="48" y1="171" x2="1152" y2="171" stroke="${t.hairline}" stroke-width="0.9"/>

  <!-- Monochrome 53-Week Cadence Matrix -->
  <g>
    ${cells.join('\n    ')}
  </g>
</svg>`;
}

async function main() {
  const data = await fetchContributions();
  fs.writeFileSync(path.join(OUT_DIR, 'telemetry-light.svg'), buildTelemetrySvg('light', data), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'telemetry-dark.svg'), buildTelemetrySvg('dark', data), 'utf8');
  console.log(
    `Updated telemetry SVGs: total=${data.totalContributions}, current=${data.current.count}d (${data.current.start}..${data.current.end}), longest=${data.longest.count}d (${data.longest.start}..${data.longest.end})`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
