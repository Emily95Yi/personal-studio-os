import { escapeHtml as esc, safeUrl } from './html.js';

// Public editorial content, not a second Event database. Replace each image.src
// with a rights-cleared real tool/activity photo. Empty URLs render honest slots.
// Keep private Workshop resources out of this public configuration.
export const tokyoExperiences = [
  {
    id: 'projection', title: '心理投射图卡', tools: 'OH卡 · 观系游戏', tone: 'blue',
    description: '从一张图像开始，观察自己的联想、感受与不同视角。借助图卡展开分享与交流，没有固定答案，也不急于得出结论。',
    image: { src: '', alt: 'OH卡与观系图卡在桌面上的真实排列', width: 1600, height: 1200, fit: 'cover' },
    photoLabel: 'OH卡 / 观系图卡',
  },
  {
    id: 'transformation', title: '自我觉察桌游', tools: '蜕变游戏', tone: 'pink',
    description: '借助游戏中的选择、提问与不同卡牌，探索当下的状态、困惑和可能性，在互动中发现新的思路。',
    image: { src: '', alt: '蜕变游戏卡牌与桌游布局的真实照片', width: 1600, height: 1200, fit: 'cover' },
    photoLabel: '蜕变游戏 / 桌游布局',
  },
  {
    id: 'creation', title: '正念与创作体验', tools: '直觉涂鸦 · 情绪编织等', tone: 'sage',
    description: '通过颜色、线条、触感与创作，让注意力回到当下。无需绘画基础，也不以作品好坏作为衡量标准。',
    image: { src: '', alt: '直觉涂鸦、手绘纸张或情绪编织的真实创作画面', width: 1600, height: 1200, fit: 'cover' },
    photoLabel: '直觉涂鸦 / 情绪编织',
  },
  {
    id: 'dialogue', title: '多样的自我对话', tools: '神谕卡 · 诗歌卡等', tone: 'apricot',
    description: '从一句话、一个词语或一张卡片出发，展开联想、书写与表达，给自己一点停下来思考的空间。',
    image: { src: '', alt: '神谕卡、诗歌卡与手写笔记本的真实照片', width: 1600, height: 1200, fit: 'cover' },
    photoLabel: '神谕卡 / 诗歌卡',
  },
];

const motifs = {
  projection: '<rect x="65" y="45" width="100" height="140" rx="8" transform="rotate(-14 115 115)"/><rect x="132" y="32" width="100" height="140" rx="8" transform="rotate(10 182 102)"/><circle cx="179" cy="85" r="20"/><path d="m153 133 20-24 30 24"/>',
  transformation: '<rect x="61" y="37" width="178" height="146" rx="13"/><path d="M93 151V71h114v80h-76v-42h38"/><circle cx="93" cy="151" r="8"/><circle cx="169" cy="109" r="8"/>',
  creation: '<path d="M63 164c-5-81 79-143 102-109s-79 60-48 92 112-50 118-20-76 65-94 39"/><path d="m199 49 17-17 12 12-17 17-21 9z"/>',
  dialogue: '<path d="M152 57c-40-19-81-10-91-3v125c26-15 59-15 91-1 31-14 64-14 89 1V54c-12-7-52-16-89 3v121"/><path d="M82 82h44m-44 21h44m-44 21h28m68-42h41m-41 21h41m-41 21h25"/>',
};

function media(card) {
  const src = safeUrl(card.image.src);
  const placeholder = '<div class="tk-tool-placeholder"' + (src ? ' hidden' : '') + '>' +
    '<svg viewBox="0 0 300 220" fill="none" aria-hidden="true">' + motifs[card.id] + '</svg>' +
    '<span>' + esc(card.photoLabel) + '</span><small>真实工具照片待补</small></div>';
  return '<div class="tk-tool-media' + (card.image.fit === 'contain' ? ' tk-tool-media-contain' : '') + '">' +
    (src ? '<img src="' + esc(src) + '" alt="' + esc(card.image.alt) + '" width="' + card.image.width +
      '" height="' + card.image.height + '" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '') + placeholder + '</div>';
}

export function tokyoExperienceView() {
  return '<section class="tk-experiences" aria-labelledby="tk-experiences-title">' +
    '<div class="tk-experience-heading tk-reveal"><p class="tk-eyebrow">EXPERIENCES & TOOLS</p>' +
    '<h2 id="tk-experiences-title">活动体验与工具</h2></div><div class="tk-tool-stack" data-tk-stack>' +
    tokyoExperiences.map((card, index) => '<article class="tk-tool-slot" data-tk-slot><div class="tk-tool-card tk-tool-' + card.tone + '">' +
      '<div class="tk-tool-copy"><span class="tk-tool-number">' + String(index + 1).padStart(2, '0') + ' / 04</span>' +
      '<div><h3>' + esc(card.title) + '</h3><p class="tk-tool-names">' + esc(card.tools) + '</p>' +
      '<p class="tk-tool-description">' + esc(card.description) + '</p></div></div>' + media(card) + '</div></article>')
      .join('<div class="tk-tool-gap" aria-hidden="true"></div>') +
    '</div></section>';
}
