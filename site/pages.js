export const workspaces = {
  workshop: {
    label: 'Workshop', icon: 'workshop', tone: 'sage',
    description: '活动企划、实践与方法积累。',
    collections: {
      projects: { label: 'Projects', zh: '项目', empty: '还没有项目', description: '这里将存放你的活动企划与实践记录。' },
      knowledge: { label: 'Knowledge', zh: '知识', empty: '还没有知识条目', description: '这里将存放带领方法、引导问题与活动复盘。' },
      resources: { label: 'Resources', zh: '资源', empty: '还没有资源', description: '这里将存放参考资料、卡牌与活动素材。' },
    },
  },
  career: {
    label: 'Career', icon: 'career', tone: 'sand',
    description: '工作经验、持续学习与职业作品。',
    collections: {
      projects: { label: 'Projects', zh: '项目', empty: '还没有项目', description: '这里将存放工作项目及其过程记录。' },
      learning: { label: 'Learning', zh: '学习', empty: '还没有学习记录', description: '这里将存放课程、资格学习与复习笔记。' },
      portfolio: { label: 'Portfolio', zh: '作品集', empty: '还没有作品', description: '这里将存放职业作品与实践案例。' },
    },
  },
  'self-board': {
    label: 'Self-Board', icon: 'self', tone: 'lilac',
    description: '给阅读、观察和个人创作留一个地方。',
    collections: {
      reading: { label: 'Reading', zh: '阅读', empty: '还没有阅读记录', description: '这里将存放书目、摘录与读后笔记。' },
      watching: { label: 'Watching', zh: '观看', empty: '还没有观看记录', description: '这里将存放影视、展览与观看笔记。' },
      notes: { label: 'Notes', zh: '笔记', empty: '还没有笔记', description: '这里将存放随手记下的观察和想法。' },
      works: { label: 'Works', zh: '作品', empty: '还没有作品', description: '这里将存放写作与其他个人创作。' },
    },
  },
};

export const brands = {
  yiqiyihui: {
    label: '一期一会 in Tokyo', icon: 'globe', tone: 'clay',
    description: '东京线下活动与公开内容。',
    pages: {
      home: { label: 'Home', zh: '首页', empty: '还没有发布内容', description: '这里将展示品牌动态和新发布的内容。' },
      activities: { label: 'Activities', zh: '活动', empty: '还没有活动', description: '这里将展示公开活动。未来可从活动详情进入报名。' },
      stories: { label: 'Stories', zh: '故事', empty: '还没有故事', description: '这里将存放公开的活动回顾与文章。' },
      about: { label: 'About', zh: '关于', empty: '介绍尚未发布', description: '这里将介绍一期一会 in Tokyo 的理念与活动方式。' },
    },
  },
};

export function href(...segments) {
  return '#/' + segments.map(encodeURIComponent).join('/');
}

export function publicHref(brandId, pageId = 'home') {
  return pageId === 'home' ? href('public', brandId) : href('public', brandId, pageId);
}

export function readRoute(hash) {
  const [path] = hash.replace(/^#/, '').split('?');
  const segments = path.split('/').filter(Boolean);
  if (segments[0] === 'private') segments.shift();
  const [root, section, pageId] = segments;
  if (!root || (root === 'home' && !section)) return { type: 'home' };
  if (root === 'search' && !section) return { type: 'search' };

  if (Object.hasOwn(workspaces, root)) {
    const workspace = workspaces[root];
    if (!section) return { type: 'overview', workspaceId: root, workspace };
    if (Object.hasOwn(workspace.collections, section)) {
      const collection = workspace.collections[section];
      if (segments.length === 2) return { type: 'collection', workspaceId: root, workspace, collection };
      return { type: 'missing', parent: href(root, section), parentLabel: collection.label };
    }
    return { type: 'missing', parent: href(root), parentLabel: workspace.label };
  }

  if (root === 'public') {
    const brandId = !section || section === 'tokyo' ? 'yiqiyihui' : section;
    const page = pageId || 'home';
    if (Object.hasOwn(brands, brandId)) {
      const brand = brands[brandId];
      if (segments.length <= 3 && Object.hasOwn(brand.pages, page)) {
        return { type: 'public', brandId, brand, pageId: page, page: brand.pages[page] };
      }
      const parentPage = Object.hasOwn(brand.pages, page) ? page : 'home';
      return { type: 'missing', parent: publicHref(brandId, parentPage), parentLabel: brand.pages[parentPage].label };
    }
  }

  return { type: 'missing', parent: href(), parentLabel: 'Home' };
}
