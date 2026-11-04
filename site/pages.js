export const spaces = {
  private: {
    label: 'Private Workspace',
    defaultPage: 'home',
    pages: [
      { id: 'home', label: 'Home', zh: '工作台', icon: 'home', group: '工作空间' },
      { id: 'workshop', label: 'Workshop', zh: '活动企划', icon: 'workshop', group: '积累领域' },
      { id: 'career', label: 'Career', zh: '职业发展', icon: 'career', group: '积累领域' },
      { id: 'self-board', label: 'Self-Board', zh: '个人积累', icon: 'self', group: '积累领域' },
      { id: 'connections', label: 'Connections', zh: '内容关联', icon: 'connections', group: '共享工具' },
      { id: 'creation', label: 'Creation', zh: '创作', icon: 'pen', group: '共享工具' },
      { id: 'publication', label: 'Publication Status', zh: '发布状态', icon: 'publish', group: '共享工具' },
      { id: 'search', label: 'Search', zh: '搜索', icon: 'search', shortcut: true },
      { id: 'inbox', label: 'Inbox', zh: '收集箱', icon: 'inbox', shortcut: true },
    ],
  },
  public: {
    label: 'Public Space',
    defaultBrand: 'tokyo',
    brands: {
      tokyo: {
        label: '一期一会 in Tokyo',
        defaultPage: 'home',
        pages: [
          { id: 'home', label: 'Home', zh: '首页' },
          { id: 'activities', label: 'Activities', zh: '活动' },
          { id: 'registration', label: 'Registration', zh: '报名' },
          { id: 'stories', label: 'Stories', zh: '故事' },
          { id: 'about', label: 'About', zh: '关于' },
        ],
      },
    },
  },
};

export function href(space, page, brand = spaces.public.defaultBrand) {
  return space === 'private' ? '#/private/' + page : '#/public/' + brand + '/' + page;
}

export function readRoute(hash) {
  const [, section, first, second] = hash.split('/');
  if (section === 'public') {
    const brand = Object.hasOwn(spaces.public.brands, first) ? first : spaces.public.defaultBrand;
    const registry = spaces.public.brands[brand];
    const page = registry.pages.find(item => item.id === second) ?? registry.pages.find(item => item.id === registry.defaultPage);
    return { space: 'public', brand, page, registry };
  }
  const registry = spaces.private;
  const page = registry.pages.find(item => item.id === first) ?? registry.pages.find(item => item.id === registry.defaultPage);
  return { space: 'private', page, registry };
}
