// Presentation-only demo material. Never saved to Studio or treated as a public Event.
const font = 'Yuanti SC, Hiragino Maru Gothic ProN, PingFang SC, sans-serif';
const studies = [
  { title: '写给未来的自己', en: 'DEAR FUTURE ME', lines: ['写给未来', '的自己。'], paper: '#dedec5', ink: '#414e3d', type: 'letter' },
  { title: '偶然的对话', en: 'A CHANCE CONVERSATION', lines: ['偶然', '的对话'], paper: '#e8a07b', ink: '#4d3849', type: 'circles' },
  { title: '让想象发生', en: 'MAKE ROOM FOR WONDER', lines: ['让想象', '发生'], paper: '#c5bade', ink: '#4b4890', type: 'flower' },
  { title: '城市漫游', en: 'WANDER / WONDER', lines: ['城市漫游'], paper: '#bdcfdf', ink: '#3e5573', type: 'wander', landscape: true },
  { title: '好好说再见', en: 'THE ART OF LETTING GO', lines: ['好好说', '再见。'], paper: '#b45d59', ink: '#f1dfc9', type: 'sun' },
  { title: '留一片空白', en: 'A LITTLE SPACE', lines: ['留一片', '空白'], paper: '#e9e5d9', ink: '#5c6b58', type: 'space' },
  { title: '慢下来', en: 'TAKE YOUR TIME', lines: ['慢下来'], paper: '#dedaa9', ink: '#5f6252', type: 'ripple', landscape: true },
  { title: '我们之间', en: 'SOMEWHERE BETWEEN US', lines: ['我们', '之间'], paper: '#a1b9ab', ink: '#354c48', type: 'between' },
];

function artwork(study, index) {
  const w = study.landscape ? 800 : 600, h = study.landscape ? 560 : 800;
  const { paper, ink, type } = study;
  const shapes = {
    letter: '<path d="M115 120h370v285H115z" fill="#eeeadc" transform="rotate(-10 300 260)"/><path d="m100 165 220 120 165-180" fill="none" stroke="' + ink + '" opacity=".35"/><path d="m105 150 45 260 335-65" fill="none" stroke="' + ink + '" opacity=".22"/>',
    circles: '<circle cx="480" cy="180" r="218" fill="' + ink + '"/><circle cx="125" cy="445" r="160" fill="#f3d5a6"/><circle cx="290" cy="300" r="92" fill="' + paper + '"/>',
    flower: '<g transform="translate(310 265)" fill="#e9dcaa">' + Array.from({ length: 8 }, (_, i) => '<ellipse ry="177" rx="56" transform="rotate(' + i * 45 + ')"/>').join('') + '<circle r="68" fill="' + ink + '"/></g>',
    wander: '<path d="M80 100h160v100h130v-80h160v160h160M80 340h160v-90h120v140h165v-50h170" fill="none" stroke="' + ink + '" stroke-width="30" opacity=".6"/><circle cx="80" cy="100" r="20" fill="#f5dc9e"/><circle cx="695" cy="340" r="20" fill="#f5dc9e"/>',
    sun: '<circle cx="385" cy="265" r="210" fill="#e5b595"/><path d="M80 265h440" stroke="' + paper + '" stroke-width="42"/><path d="M80 320h440" stroke="' + paper + '" stroke-width="22"/>',
    space: '<rect x="160" y="145" width="290" height="330" rx="145" fill="#d0d3c6"/><rect x="205" y="165" width="245" height="330" rx="122" fill="' + paper + '"/><path d="M80 600h440M80 622h440" stroke="' + ink + '" opacity=".3"/>',
    ripple: '<g fill="none" stroke="' + ink + '" opacity=".4">' + [60, 100, 145, 195, 250, 310].map(r => '<ellipse cx="580" cy="190" rx="' + r + '" ry="' + r * .7 + '"/>').join('') + '</g>',
    between: '<circle cx="180" cy="310" r="185" fill="#e3e1c9"/><circle cx="425" cy="310" r="185" fill="' + ink + '"/><path d="M303 172c-95 78-95 198 0 276 95-78 95-198 0-276" fill="#93b4d2"/>',
  }[type];
  const titleY = study.landscape ? 395 : 565;
  const title = study.lines.map((line, i) => '<text x="44" y="' + (titleY + i * 92) + '" font-size="' +
    (study.landscape ? 83 : 82) + '" font-weight="700" letter-spacing="-5">' + line + '</text>').join('');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
    '<rect width="100%" height="100%" fill="' + paper + '"/><g font-family="' + font + '" fill="' + ink + '">' +
    '<text x="44" y="49" font-size="12" letter-spacing="1.5">一期一会 inTokyo</text><text x="' + (w - 44) + '" y="49" font-size="11" text-anchor="end" letter-spacing="1">DEMO / ' + String(index + 1).padStart(2, '0') + '</text>' +
    shapes + title + '<text x="46" y="' + (h - 76) + '" font-size="12" letter-spacing="2">' + study.en + '</text>' +
    '<path d="M44 ' + (h - 56) + 'H' + (w - 44) + '" stroke="' + ink + '" opacity=".4"/>' +
    '<text x="44" y="' + (h - 29) + '" font-size="9" letter-spacing="1">VISUAL STUDY — 演示海报 / 非真实活动</text></g></svg>';
  return { poster: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), width: w, height: h };
}

export const demoPosters = studies.map((study, i) => Object.freeze({
  id: 'tokyo-demo-' + (i + 1), title: study.title, demo: true, recruiting: false, cancelled: false,
  date: '', time: '', location: '', registrationUrl: '',
  description: '这是一张演示海报，用来体验画廊的错落拼贴、轻微倾斜与原位放大。\n关闭后，海报会回到原来的位置。内容不代表真实发布的活动。',
  ...artwork(study, i),
}));

export function exhibitionEvents(events, { showDemo = true } = {}) {
  return events.length || !showDemo ? events : demoPosters;
}
