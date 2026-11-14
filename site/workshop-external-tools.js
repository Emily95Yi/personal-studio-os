const externalTools = [
  {
    id: 'external:relationship-game-2',
    title: 'Relationship Game 2',
    description: '观系卡牌互动游戏，可为工作坊创建多人房间。',
    type: 'game',
    appLocation: 'https://relationship-game-2.onrender.com/',
    repositoryUrl: 'https://github.com/Emily95Yi/Relationship-game-2',
  },
  {
    id: 'external:app-presence',
    title: 'App Presence',
    description: '用于个人体验和反思的互动应用。',
    type: 'app',
    appLocation: 'https://app-presence.onrender.com/',
    repositoryUrl: 'https://github.com/Emily95Yi/App_Presence',
  },
  {
    id: 'external:yiqiyihui-workshop-website',
    title: 'YiQiYiHui Workshop Website',
    description: '一期一会 in Tokyo 的工作坊网站。',
    type: 'app',
    appLocation: 'https://yiqiyihui-workshop-website.onrender.com/',
    repositoryUrl: 'https://github.com/Emily95Yi/YiQiYiHui-Workshop-Website',
  },
].map(tool => Object.freeze({ ...tool, visibility: 'private' }));

const toolsById = new Map(externalTools.map(tool => [tool.id, tool]));

export function externalWorkshopTool(id) {
  return toolsById.get(id);
}

export function workshopTools(state) {
  const stored = state.interactiveTools ?? [];
  return [...externalTools, ...stored.filter(tool => !toolsById.has(tool.id))];
}
