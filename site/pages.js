import { selfBoardIncludes, studioRepository, workshopRepository } from './repository.js';

export const workspaces = {
  workshop: {
    label: 'Workshop', icon: 'workshop', tone: 'sage',
    description: '围绕可重复使用的活动形式，积累实践与设计素材。',
    collections: {
      projects: {
        label: 'Projects', zh: '活动形式与系列', empty: '还没有活动系列',
        description: '每个 Project 代表一种可长期演进的活动形式，并可包含多个不同主题的 Event。',
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
      'sop-habits': {
        label: 'SOP & Habits', zh: '流程与习惯',
      },
      'to-do': {
        label: 'To-Do', zh: '待办与计划', empty: '还没有待办事项',
        description: '这里用于记录一次性任务与个人计划。未来可以关联流程、习惯或其他内容。',
      },
    },
  },
};

// These entries configure the read-only structure preview. They are not stored records.
export const workshopStructure = {
  previewId: 'preview',
  sections: {
    events: {
      label: 'Events', zh: '活动场次',
      empty: '还没有 Event', description: '这里将列出实际举办或计划举办的活动。每个 Event 都有独立的主题、日期和历史。',
    },
    resources: {
      label: 'Resources', zh: '设计素材与引用',
      description: '这里收纳项目专属素材，也可以引用 Self-Board / Discover 的原始资料。资源模块按项目配置。',
    },
  },
  eventSections: [
    { label: 'Overview', zh: '基本信息', fields: [
      { key: 'theme', label: '主题' }, { key: 'date', label: '日期' }, { key: 'location', label: '地点' },
      { key: 'attendeeCount', label: '人数' }, { key: 'status', label: '状态' },
    ] },
    { label: 'Flow', zh: '活动流程', empty: '还没有流程记录。' },
    { label: 'Poster & Media', zh: '海报与媒体', empty: '还没有海报或媒体。' },
    { label: 'Reflection', zh: '总结与复盘', empty: '还没有复盘记录。' },
  ],
  defaultResourceModules: [
    { id: 'guiding-questions', label: 'Guiding Questions', zh: '引导问题' },
    { id: 'cards', label: 'Cards', zh: '卡牌及应用方法' },
    { id: 'goals', label: 'Goals & Expected Outcomes', zh: '活动目的与预期效果' },
    { id: 'references', label: 'References', zh: '理论、资料与外部链接' },
  ],
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

function missing(parent, parentLabel) {
  return { type: 'missing', parent, parentLabel };
}

function readProjectRoute(collectionRoute, [projectId, sectionId, eventId, ...rest]) {
  const { previewId, sections } = workshopStructure;
  const collectionPath = ['workshop', 'projects'];
  const preview = projectId === previewId;
  const project = preview ? undefined : workshopRepository.getProject(projectId);
  if (!preview && !project) return missing(href(...collectionPath), collectionRoute.collection.label);

  const projectPath = [...collectionPath, projectId];
  const projectLabel = project?.title ?? 'Project 结构预览';
  const route = { ...collectionRoute, type: 'project', project, projectPath, projectLabel, preview };
  if (!sectionId) return route;
  if (!Object.hasOwn(sections, sectionId)) return missing(href(...projectPath), projectLabel);

  const section = sections[sectionId];
  const sectionPath = [...projectPath, sectionId];
  const sectionRoute = { ...route, type: 'project-section', section, sectionId, sectionPath };
  if (!eventId) {
    return sectionId === 'events' ? { ...route, redirect: href(...projectPath) } : sectionRoute;
  }
  if (sectionId !== 'events' || rest.length) return missing(href(...sectionPath), section.label);

  const event = preview ? undefined : workshopRepository.getEvent(projectId, eventId);
  if (preview ? eventId !== previewId : !event) return missing(href(...sectionPath), section.label);
  return { ...sectionRoute, type: 'event', event, eventLabel: event?.title ?? 'Event 结构预览' };
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
  if (root === 'calendar' && !section) {
    const params = new URLSearchParams(query);
    return params.get('from') === 'self-board'
      ? { type: 'calendar', params, parent: href('self-board'), parentLabel: 'Self-Board' }
      : { type: 'calendar', params };
  }

  if (Object.hasOwn(workspaces, root)) {
    const workspace = workspaces[root];
    if (!section) return { type: root === 'workshop' ? 'workshop-gallery' : 'overview', workspaceId: root, workspace };
    if (Object.hasOwn(workspace.collections, section)) {
      const collection = workspace.collections[section];
      const route = { type: 'collection', workspaceId: root, workspace, collectionId: section, collection };
      if (root === 'workshop' && section === 'projects') {
        if (segments.length === 2) return { type: 'workshop-gallery', workspaceId: root, workspace, redirect: href(root) };
        return readProjectRoute(route, segments.slice(2));
      }
      if (segments.length === 2) return route;
      if (root === 'self-board' && section === 'sop-habits' && segments.length === 3 && ['focus', 'sop'].includes(pageId)) {
        return { ...route, type: 'action-preview', action: pageId, actionLabel: pageId === 'focus' ? 'Habit Focus' : 'SOP 执行' };
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
