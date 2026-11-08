const defaultTopicId = '80d414b7-b9b8-49e8-ab8a-8c0c89a2844f';
export function ensureCaptureTopic(state) {
  if (state.explorationTopics.some(row => !row.deletedAt && row.title === '待分类')) return;
  const ids = new Set(state.explorationTopics.map(row => row.id));
  let id = defaultTopicId;
  for (let suffix = 2; ids.has(id); suffix++) id = defaultTopicId + '-' + suffix;
  state.explorationTopics.push({ id, title: '待分类', description: '', tags: [] });
}
