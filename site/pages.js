import { contentTitle, objectFor, studioStore } from './studio-data.js';
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
        entryLabel: '考试', icon: 'exam', entryHref: 'https://emily-quiz-notebook.cho-eki0915.workers.dev/',
        description: '这里将汇总资格考试、题库练习、错题、学习进度和考试知识，后续接入独立题库。',
      },
      'resume-experience': {
        label: 'Resume & Experience', zh: '简历与经历', empty: '还没有简历或经历记录',
        entryLabel: '简历', icon: 'resume',
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

export const boardSections = {
  writing: { label: 'Writing', zh: '文章与作品', icon: 'edit' },
  reflections: { label: 'Reflections', zh: '想法与灵感', icon: 'self' },
  discover: { label: 'Discover', zh: '知识与探索', icon: 'globe' },
  collections: { label: 'Collections', zh: '生活收藏', icon: 'folder' },
};

const boardViews = {
  writing: ['all', 'drafts', 'published', 'collections'],
  reflections: ['all', 'timeline', 'topics', 'open-questions', 'revisited', 'fragments'],
  discover: ['all', 'knowledge', 'resources', 'exercises', 'inspirations'],
  connections: ['relations', 'unlinked'],
};

export const boardHref = (section, view) => href('self-board', ...(section ? [section] : [])) +
  (view ? '?view=' + encodeURIComponent(view) : '');
export function boardSettingsAddress(from, view) {
  const query = new URLSearchParams(view ? { view } : undefined);
  if (from) query.set('from', from);
  return boardHref('settings') + (query.size ? '?' + query : '');
}
export const autoSourceAddress = id => href('self-board', 'auto') + '?' + new URLSearchParams({ source: id });
export const boardContentHref = id => href('self-board', 'content', id);
export const explorationAddress = id => id ? href('self-board', 'explorations', id) : boardHref('discover') + '?tab=explorations';
export const collectionItemAddress = id => href('self-board', 'collections', id);
export function inboxAddress(id, params) {
  const query = params?.toString();
  return href('self-board', 'inbox', ...(id ? [id] : [])) + (query ? '?' + query : '');
}
export function collectionsAddress({ category = 'all', folder = '' } = {}) {
  const query = new URLSearchParams();
  if (category !== 'all') query.set('category', category || 'inbox');
  if (folder) query.set('folder', folder);
  return boardHref('collections') + (query.size ? '?' + query : '');
}

export function discoverAddress(category, folderId, creating = false) {
  const query = new URLSearchParams(creating ? { view: 'new' } : undefined);
  if (category) query.set('category', category);
  if (folderId) query.set('folder', folderId);
  return boardHref('discover') + (query.size ? '?' + query : '');
}

function boardSettingsParent(params) {
  const from = params.get('from') || '';
  return /^#\/(?:private\/)?self-board(?:\/(?!settings(?:[/?]|$))[^?#]*)?(?:\?[^#]*)?$/.test(from) ? from : boardHref();
}

function boardRoute(workspace, section, id, params) {
  const base = { workspaceId: 'self-board', workspace, section, params };
  if (!section) {
    return params.get('view') === 'trash' ? { redirect: boardSettingsAddress('', 'trash') } : { ...base, type: 'board' };
  }
  if (section === 'inbox') {
    const parent = id ? inboxAddress(undefined, params) : boardHref();
    return { ...base, type: 'capture', captureId: id, parent, parentLabel: id ? 'Inbox' : 'Self-Board',
      recordTitle: id ? '收藏详情' : 'Inbox' };
  }
  if (section === 'search' && !id) return { ...base, type: 'board', view: section };
  if (section === 'settings' && !id) {
    const from = boardSettingsParent(params);
    if (params.get('view') === 'trash') return { ...base, type: 'board', view: 'trash', recordTitle: '回收站',
      parent: boardSettingsAddress(from), parentLabel: 'Self-Board 设置' };
    return { ...base, type: 'board', view: section, parent: from, parentLabel: '上一页' };
  }
  if (section === 'writing' && id === 'new') return { ...base, type: 'board', view: 'new' };
  if (section === 'discover' && !id && params.get('tab') === 'explorations') {
    return { ...base, type: 'board', tab: 'explorations' };
  }
  if (section === 'collections' && !id) return { ...base, type: 'board' };
  if (id && ['explorations', 'collections'].includes(section)) {
    const topic = section === 'explorations';
    const entity = topic ? 'topic' : 'collection-item';
    const record = objectFor(studioStore.state, entity, id);
    const parent = topic ? explorationAddress() : collectionsAddress({ category: record?.categoryId, folder: record?.folderId });
    const parentLabel = topic ? 'Personal Explorations' : 'Collections';
    return record && !record.deletedAt ? { ...base, section: topic ? 'discover' : section, type: 'board',
      tab: topic ? 'explorations' : undefined, entity, record, parent, parentLabel } : missing(parent, parentLabel);
  }
  if (section === 'discover' && !id && params.get('view') === 'new') {
    return { ...base, type: 'board', view: 'new', parent: discoverAddress(params.get('category'), params.get('folder')),
      parentLabel: 'Discover' };
  }
  if (Object.hasOwn(boardViews, section) && !id) {
    const requested = params.get('view');
    if (section === 'writing' && requested === 'unused-fragments') {
      return { redirect: boardHref('reflections', 'fragments') };
    }
    const selected = section === 'writing' && requested === 'in-progress' ? 'drafts' : requested;
    return { ...base, type: 'board', view: boardViews[section].includes(selected) ? selected : boardViews[section][0] };
  }
  if (id && ['content', 'discover', 'experience', 'reflect-create'].includes(section)) {
    const record = studioRepository.get(id);
    if (record && !record.deletedAt && selfBoardIncludes(record, ['experience', 'reflect-create'].includes(section) ? section : undefined)) {
      return { ...base, type: 'content-detail', record, recordTitle: contentTitle(record) };
    }
  }
}

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
    if (root === 'self-board' && segments.length <= 3) {
      const board = boardRoute(workspace, section, pageId, new URLSearchParams(query));
      if (board) return board;
    }
    if (!section) return { type: root === 'workshop' ? 'workshop-gallery' : 'overview', workspaceId: root, workspace };
    if (root === 'workshop' && section === 'import' && !pageId) {
      return { type: 'workshop-import', workspaceId: root, workspace };
    }
    if (root === 'self-board' && ['sop-habits', 'to-do'].includes(section)) {
      return { redirect: href('self-board', 'auto') };
    }
    if (Object.hasOwn(workspace.collections, section)) {
      const collection = workspace.collections[section];
      const route = { type: 'collection', workspaceId: root, workspace, collectionId: section, collection, params: new URLSearchParams(query) };
      if (root === 'workshop' && section === 'projects') {
        if (segments.length === 2) return { type: 'workshop-gallery', workspaceId: root, workspace, redirect: href(root) };
        return readProjectRoute(route, segments.slice(2), new URLSearchParams(query));
      }
      if (segments.length === 2) return route;
      if (root === 'self-board' && section === 'auto' && segments.length === 3) {
        const plan = plannerRepository.getPlan(pageId);
        if (plan) return { ...route, type: 'auto-plan', record: plan, plan };
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
