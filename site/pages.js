import { plannerRepository, selfBoardIncludes, studioRepository, workshopRepository } from './repository.js';

export const workspaces = {
  workshop: {
    label: 'Workshop', icon: 'workshop',
    description: '围绕可重复使用的活动形式，积累实践与设计素材。',
    collections: {
      projects: {
        label: 'Projects', zh: '活动形式与系列',
      },
    },
  },
  career: {
    label: 'Career', icon: 'career',
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
    label: 'Self-Board', icon: 'self',
    description: '积累兴趣、体验生活、记录创作，也照顾日常行动。',
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
      auto: { label: 'Auto', zh: '计划与行动' },
    },
  },
};

export const brands = {
  yiqiyihui: {
    label: '一期一会 in Tokyo', entryLabel: '一期一会 InTokyo', icon: 'globe',
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

function missing(parent, parentLabel) {
  return { type: 'missing', parent, parentLabel };
}

function readProjectRoute(collectionRoute, [projectId, section, eventId, ...rest], params) {
  const project = workshopRepository.getProject(projectId);
  if (!project) return missing(href('workshop'), 'Workshop');

  const projectPath = ['workshop', 'projects', projectId];
  const projectLabel = project.title;
  const route = { ...collectionRoute, type: 'project', project, projectPath, projectLabel };
  if (!section) return route;
  if (rest.length || (eventId && section !== 'events')) return missing(href(...projectPath), projectLabel);
  if (section === 'resources') return { redirect: href(...projectPath, 'common') };
  if (section === 'common') return {
    ...route, tab: 'common', documentId: params.get('document'), versionId: params.get('version'),
  };
  if (section !== 'events') return missing(href(...projectPath), projectLabel);
  if (!eventId) return { redirect: href(...projectPath) };

  const event = workshopRepository.getEvent(projectId, eventId);
  if (!event) return missing(href(...projectPath), projectLabel);
  return { ...route, type: 'event', event, eventLabel: event.title };
}

export function readRoute(hash) {
  const [path, query] = hash.replace(/^#/, '').split('?');
  let segments;
  try {
    segments = path.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return missing(href(), 'Home');
  }
  if (segments[0] === 'private') segments.shift();
  const [root, section, pageId] = segments;
  if (!root || (root === 'home' && !section)) return { type: 'home' };
  if (root === 'search' && !section) return { type: 'search' };
  if (root === 'settings' && !section) return { type: 'settings', parent: href('calendar'), parentLabel: 'Calendar' };
  if (root === 'calendar' && !section) {
    const params = new URLSearchParams(query);
    const from = params.get('from');
    if (from === 'auto') return { type: 'calendar', params, parent: href('self-board', 'auto'), parentLabel: 'Auto' };
    return from === 'self-board'
      ? { type: 'calendar', params, parent: href('self-board'), parentLabel: 'Self-Board' }
      : { type: 'calendar', params };
  }

  if (Object.hasOwn(workspaces, root)) {
    const workspace = workspaces[root];
    if (!section) return { type: root === 'workshop' ? 'workshop-gallery' : 'overview', workspaceId: root, workspace };
    if (root === 'workshop' && section === 'import' && !pageId) {
      return { type: 'workshop-import', workspaceId: root, workspace };
    }
    if (root === 'self-board' && ['sop-habits', 'to-do'].includes(section)) {
      return { redirect: href('self-board', 'auto') };
    }
    if (Object.hasOwn(workspace.collections, section)) {
      const collection = workspace.collections[section];
      const route = { type: 'collection', workspaceId: root, workspace, collectionId: section, collection };
      if (root === 'workshop' && section === 'projects') {
        if (segments.length === 2) return { type: 'workshop-gallery', workspaceId: root, workspace, redirect: href(root) };
        return readProjectRoute(route, segments.slice(2), new URLSearchParams(query));
      }
      if (segments.length === 2) return route;
      if (root === 'self-board' && section === 'auto' && segments.length === 3) {
        const plan = plannerRepository.getPlan(pageId);
        if (plan) return { ...route, type: 'auto-plan', record: plan, plan };
      }
      if (root === 'self-board' && ['discover', 'experience', 'reflect-create'].includes(section) && segments.length === 3) {
        const record = studioRepository.get(pageId);
        if (record && selfBoardIncludes(record, section === 'discover' ? undefined : section)) {
          return { ...route, type: 'content-detail', record };
        }
      }
      return missing(href(root, section), collection.label);
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
