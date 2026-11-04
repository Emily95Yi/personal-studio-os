const content = [
  { id:'excerpt', title:'注意力是如何被分配的？', domains:['Self-Board','Workshop'], kind:'input', category:'Reading', state:'已整理', visibility:'私人', format:'结构化', date:'11.04', description:'从阅读摘录出发，观察在忙碌和混乱中，什么能让我们重新感到自己拥有选择。' },
  { id:'capture', title:'一张桌子上的安静', domains:['Self-Board'], kind:'input', category:'Notes', state:'待整理', visibility:'私人', format:'碎片化', date:'11.05', description:'关于留白、停顿和邀请的一则临时观察。' },
  { id:'theme', title:'从留白到选择', domains:['Workshop','Self-Board'], kind:'input', category:'理论与方法', state:'已整理', visibility:'私人', format:'结构化', date:'11.03', description:'把阅读里的问题变成活动主题：为每个人留下一点不被定义的空间。' },
  { id:'plan', title:'低熵生活', domains:['Workshop','Self-Board'], kind:'output', category:'活动企划', state:'进行中', visibility:'私人', date:'11.05', description:'一场关于注意力、日常秩序与重新选择的线下活动企划。' },
  { id:'poster', title:'活动邀请 · 低熵生活', domains:['Workshop'], kind:'output', category:'活动发布', state:'已完成', visibility:'已公开', date:'11.04', description:'仅公开批准的标题、介绍与体验信息。原始企划、参加者资料及现场反馈保留在内部。' },
  { id:'practice', title:'线下活动 · 体验与交流', domains:['Workshop'], kind:'output', category:'活动记录', state:'已完成', visibility:'私人', date:'11.04', description:'现场安排、主持记录与参与者体验，用于下一次设计。' },
  { id:'story', title:'把时间留给真正重要的事', domains:['Workshop','Self-Board'], kind:'output', category:'公开回顾', state:'已完成', visibility:'已公开', date:'11.05', description:'经过选择的公开回顾。讨论细节、可识别信息和私人反馈不在公开投影中。' },
  { id:'reflection', title:'活动之后，还剩下什么？', domains:['Self-Board','Workshop'], kind:'input', category:'Thoughts', state:'待整理', visibility:'私人', format:'碎片化', date:'11.05', description:'把经验和反馈带回 Self-Board，记录哪些主持方式值得在下一次企划中保留。' },
  { id:'odyssey', title:'人生奥德赛', domains:['Workshop'], kind:'output', category:'活动企划', state:'进行中', visibility:'私人', date:'11.02', description:'借助卡牌和叙事，尝试描绘同一人生的不同走向。' },
  { id:'present', title:'回应此刻', domains:['Workshop'], kind:'output', category:'活动复盘', state:'已完成', visibility:'私人', date:'10.29', description:'这份已经完成的复盘依然属于私人空间。' },
  { id:'ab900', title:'AB-900 学习档案', domains:['Career'], kind:'input', category:'资格学习', state:'进行中', visibility:'私人', format:'结构化', date:'11.04', description:'整理认证主题、题库索引和复习重点。Demo 保留整合入口。' },
  { id:'case', title:'把知识整理成可复用的方法', domains:['Career','Self-Board'], kind:'output', category:'职业作品', state:'草稿', visibility:'私人', date:'11.03', description:'试着把资料分类、检索和跨领域连接，整理成一份可复用的案例。' },
  { id:'cards', title:'图像卡的引导问题', domains:['Workshop'], kind:'input', category:'卡牌 Wiki', state:'待整理', visibility:'私人', format:'碎片化', date:'11.05', description:'把开放式提问先放进收集箱，再判断可以用在哪个活动。' },
  { id:'essay', title:'关于个人节奏的三封信', domains:['Self-Board'], kind:'output', category:'Creative Works', state:'已完成', visibility:'待确认', date:'11.01', description:'写作已经完成，是否公开、选哪一部分仍需单独确认。' },
];

const relations = [
  ['excerpt','theme','提供灵感'], ['theme','plan','发展为'], ['plan','poster','选择性发布'], ['poster','practice','邀请参与'],
  ['practice','story','整理为'], ['story','reflection','引出思考'], ['practice','reflection','回收经验'],
  ['reflection','plan','改进下一版'], ['excerpt','case','方法复用'], ['cards','odyssey','主持参考'],
];

const activities = [
  { id:'quiet', title:'低熵生活', subtitle:'在混乱里找到内在秩序', type:'开放预览', time:'11.28 · 周六下午', place:'Tokyo · 小组体验', art:'olive', description:'从图像卡、短写作和安静的分享出发，在日常的杂音里重新听见自己的选择。' },
  { id:'odyssey', title:'人生奥德赛', subtitle:'人生可以有不止一种走法', type:'往期活动', time:'09.12 · 周六下午', place:'Tokyo · 叙事工作坊', art:'clay', description:'从一个熟悉的选择出发，画出两条没有走过的路径。' },
  { id:'present', title:'回应此刻', subtitle:'给此刻的自己一点时间', type:'往期活动', time:'08.22 · 周六下午', place:'Tokyo · 小组交流', art:'sand', description:'练习在交流中留下停顿，听见此刻真正想说的话。' },
];

const stories = [
  { id:'time', title:'把时间留给真正重要的事', category:'活动回声', time:'5 分钟阅读', art:'clay', description:'活动结束以后，有些选择依然没有答案。我们开始习惯给这些问题留下一点时间。' },
  { id:'listen', title:'一起停下来，是怎样的一种体验', category:'主题延伸', time:'3 分钟阅读', art:'olive', description:'听见别人之前，也可以先听见自己。留白为新的关系和理解留出了一点空间。' },
  { id:'table', title:'一张桌子，几种人生的可能', category:'活动记录', time:'4 分钟阅读', art:'sand', description:'不同的路线在桌上展开，原来我们有如此多观察同一件事的方式。' },
];

export const studioRepository = {
  list({ domain, kind, query = '' } = {}) {
    const q = query.trim().toLowerCase();
    return content.filter(item => (!domain || item.domains.includes(domain)) &&
      (!kind || item.kind === kind) &&
      [item.title, item.category, item.description, ...item.domains].join(' ').toLowerCase().includes(q));
  },
  get(id) { return content.find(item => item.id === id); },
  related(id) {
    return relations.filter(row => row[0] === id || row[1] === id).map(([source, target, label]) => ({
      item: this.get(source === id ? target : source), label, incoming: target === id,
    }));
  },
};

export const publicRepository = {
  activities() { return activities; },
  stories() { return stories; },
};
