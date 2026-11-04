export const workspaces = {
  workshop: {
    label: 'Workshop', icon: 'workshop', tone: 'sage',
    description: '策划线下活动，记录每次实践，按需引用资料。',
    collections: {
      projects: {
        label: 'Projects', zh: '活动企划', empty: '还没有活动项目',
        description: '这里将存放活动主题、企划、流程、主持稿和相关创作。',
      },
      sessions: {
        label: 'Sessions', zh: '执行与复盘', empty: '还没有活动场次',
        description: '这里将记录实际举办的活动、执行过程与复盘。一个项目可以关联多个场次。',
      },
      references: {
        label: 'References', zh: '关联资料', empty: '还没有引用资料',
        description: '这里将显示项目关联的资料和素材。原始资料存放在 Self-Board 的 Discover，可供多个项目引用。',
      },
    },
  },
  career: {
    label: 'Career', icon: 'career', tone: 'sand',
    description: '为职业发展积累资格学习、工作经验和专业技能。',
    collections: {
      'exams-practice': {
        label: 'Exams & Practice', zh: '考试与练习', empty: '还没有考试或练习记录',
        description: '这里将汇总资格考试、题库练习、错题、学习进度和考试知识，后续接入独立题库。',
      },
      'resume-experience': {
        label: 'Resume & Experience', zh: '简历与经历', empty: '还没有简历或经历记录',
        description: '这里将存放简历、工作经历、项目经验、专业技能和成果描述。',
      },
    },
  },
  'self-board': {
    label: 'Self-Board', icon: 'self', tone: 'lilac',
    description: '积累兴趣、体验生活，也留一点空间给记录和自由创作。',
    collections: {
      discover: {
        label: 'Discover', zh: '发现与积累', empty: '还没有收藏或资料',
        description: '这里将存放阅读与课程、网络收藏、卡牌知识、理论、文章、图片和链接。',
      },
      experience: {
        label: 'Experience', zh: '生活与体验', empty: '还没有体验记录',
        description: '这里将存放旅行、美食、影视、展览和日常探索的记录。',
      },
      'reflect-create': {
        label: 'Reflect & Create', zh: '记录与表达', empty: '还没有记录或作品',
        description: '这里将存放日记、随笔、个人思考、读后感、观后感、文章和自由创作。',
      },
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
