const defaultTopicId = '80d414b7-b9b8-49e8-ab8a-8c0c89a2844f';
export function ensureCaptureTopic(state) {
  if (!state.explorationTopics.some(row => row.id === defaultTopicId || (!row.deletedAt && row.title === '待分类'))) {
    state.explorationTopics.push({ id: defaultTopicId, title: '待分类', description: '', tags: [] });
  }
}
