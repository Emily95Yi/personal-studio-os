export const workspaces = {
  workshop: {
    label: 'Workshop', zh: '活动企划', icon: 'workshop', tone: 'sage', number: '01',
    description: '活动设计、带领方法与线下实践。',
    overview: '把一个活动想法带到现场，再把经验带回下一次企划。',
    collections: [
      { id: 'projects', label: 'Projects', zh: '项目库', description: '活动企划、实践记录与复盘。', categories: ['活动企划', '活动记录', '活动复盘'] },
      { id: 'knowledge', label: 'Knowledge', zh: '知识库', description: '卡牌 Wiki、理论、引导问题和参考资料。', kind: 'input' },
      { id: 'publications', label: 'Publications', zh: '活动发布', description: '活动邀请与可分享的回顾。', categories: ['活动发布', '公开回顾'] },
      { id: 'library', label: 'Library', zh: '全部内容', description: '浏览 Workshop 关联的全部输入与输出。' },
    ],
  },
  career: {
    label: 'Career', zh: '职业发展', icon: 'career', tone: 'sand', number: '02',
    description: '职业经验、资格学习与作品档案。',
    overview: '整理学习与工作经验，把可复用的方法发展成作品。',
    collections: [
      { id: 'learning', label: 'Learning', zh: '学习与认证', description: '资格学习、复习重点和题库索引。', categories: ['资格学习'] },
      { id: 'portfolio', label: 'Portfolio', zh: '职业作品', description: '案例、作品和可以分享的实践经验。', categories: ['职业作品'] },
      { id: 'projects', label: 'Projects', zh: '工作项目', description: '这里汇总工作项目及其过程记录。', categories: ['工作项目'] },
      { id: 'library', label: 'Library', zh: '全部内容', description: '浏览 Career 关联的全部输入与输出。' },
    ],
  },
  'self-board': {
    label: 'Self-Board', zh: '个人积累', icon: 'self', tone: 'lilac', number: '03',
    description: '阅读、观察、思考与个人创作。',
    overview: '给值得记下的段落和还没想清楚的问题留一点空间。',
    collections: [
      { id: 'reading', label: 'Reading', zh: '阅读', description: '阅读摘录、书目与读后思考。', categories: ['Reading'] },
      { id: 'watching', label: 'Watching', zh: '观看', description: '影视、展览与观看笔记。', categories: ['Watching'] },
      { id: 'notes', label: 'Notes', zh: '笔记', description: '随手记下的观察和片段。', categories: ['Notes'] },
      { id: 'thoughts', label: 'Thoughts', zh: '思考', description: '有待继续追问的问题。', categories: ['Thoughts'] },
      { id: 'inspirations', label: 'Inspirations', zh: '灵感', description: '留给未来作品的线索。', categories: ['Inspirations'] },
      { id: 'journals', label: 'Journals', zh: '手记', description: '可按时间回看的个人记录。', categories: ['Journals'] },
      { id: 'creative-works', label: 'Creative Works', zh: '个人作品', description: '短文、写作练习与其他作品。', categories: ['Creative Works'] },
      { id: 'library', label: 'Library', zh: '全部内容', description: '浏览 Self-Board 关联的全部输入与输出。' },
    ],
  },
};

export const tools = {
  connections: { label: 'Connections', zh: '内容关联', icon: 'connections' },
  creation: { label: 'Creation', zh: '创作', icon: 'pen' },
  publication: { label: 'Publication Status', zh: '发布状态', icon: 'publish' },
  search: { label: 'Search', zh: '搜索', icon: 'search' },
  inbox: { label: 'Inbox', zh: '收集箱', icon: 'inbox' },
};

export const brands = {
  yiqiyihui: {
    label: '一期一会 in Tokyo', icon: 'globe', tone: 'clay', number: '04',
    description: '东京线下活动、公开故事与报名预览。',
    pages: {
      home: { label: 'Home', zh: '首页' },
      activities: { label: 'Activities', zh: '活动', hasDetails: true },
      registration: { label: 'Registration', zh: '报名' },
      stories: { label: 'Stories', zh: '故事', hasDetails: true },
      about: { label: 'About', zh: '关于' },
    },
  },
};

export const defaultBrand = 'yiqiyihui';

export function href(...segments) {
  return '#/' + segments.map(encodeURIComponent).join('/');
}

export function publicHref(brand, page = 'home', id) {
  if (id) return href('public', brand, page, id);
  return page === 'home' ? href('public', brand) : href('public', brand, page);
}

export function matchesCollection(item, collection) {
  return (!collection.categories || collection.categories.includes(item.category)) &&
    (!collection.kind || item.kind === collection.kind);
}

export function itemHref(item, context = {}) {
  if (context.type === 'collection') return href(context.workspaceId, context.collection.id, item.id);
  if (context.type === 'tool') return href(context.toolId, item.id);
  const workspaceId = context.workspaceId ?? Object.keys(workspaces).find(id => workspaces[id].label === item.domains[0]);
  if (!workspaceId) return href('search', item.id);
  const collection = workspaces[workspaceId].collections.find(entry => matchesCollection(item, entry));
  return href(workspaceId, collection.id, item.id);
}

export function readRoute(hash) {
  const [path, query] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  const segments = path.split('/').filter(Boolean);
  if (segments[0] === 'private') segments.shift();
  const [root, section, id, publicItem] = segments;
  if (!root || (root === 'home' && !section)) return { type: 'home' };

  if (root === 'public' && segments.length <= 4) {
    const brandId = !section || section === 'tokyo' ? defaultBrand : section;
    const pageId = id || 'home';
    if (Object.hasOwn(brands, brandId)) {
      const brand = brands[brandId];
      const page = Object.hasOwn(brand.pages, pageId) ? brand.pages[pageId] : null;
      if (page && (!publicItem || page.hasDetails)) return { type: 'public', brandId, brand, pageId, page, itemId: publicItem, params };
    }
  }

  if (Object.hasOwn(workspaces, root) && segments.length <= 3) {
    const workspace = workspaces[root];
    if (!section) return { type: 'overview', workspaceId: root, workspace };
    const collection = workspace.collections.find(item => item.id === section);
    if (collection) return { type: 'collection', workspaceId: root, workspace, collection, itemId: id };
  }

  if (Object.hasOwn(tools, root) && segments.length <= 2) {
    return { type: 'tool', toolId: root, tool: tools[root], itemId: section, params };
  }

  return { type: 'missing' };
}
