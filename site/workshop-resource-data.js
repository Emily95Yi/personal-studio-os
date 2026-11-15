import { isWorkshopWiki, workshopWikiCategories } from './self-board-data.js';
import { validImage } from './studio-data.js';

const [tools, prompts, concepts] = workshopWikiCategories.map(([category]) => category);
export const resourceTemplates = {
  card_set: { label: '卡组', category: tools, fields: {
    background: '背景', features: '特点', composition: '组成', scenarios: '适用情境', cautions: '使用注意',
  } },
  card: { label: '单卡', category: tools, fields: {
    number: '编号', description: '客观描述', neutralTags: '中立描述标签',
    associationAngles: '联想角度', associationSources: '联想来源',
  } },
  method: { label: '使用方法', category: tools, fields: {
    purpose: '目的', audienceSize: '对象人数', duration: '时长', materials: '材料', steps: '步骤',
    promptSequence: '提问顺序', adjustments: '调整方式', cautions: '注意事项',
  } },
  prompt: { label: '提问／提问序列', category: prompts, fields: {
    question: '问题原文', purpose: '用途', stage: '阶段', followUps: '追问', cautions: '注意事项',
  } },
  agreement: { label: '活动约定', category: prompts, fields: {
    participantTerms: '参与者约定', facilitatorGuidelines: '主持人内部方针', scope: '适用范围',
  } },
  theme: { label: '母题', category: concepts, fields: {
    description: '说明', coreQuestion: '核心问题', values: '价值点', findings: '活动发现与出处',
  } },
  positioning: { label: '活动定位', category: concepts, fields: {
    audience: '对象', context: '回应的处境', value: '价值', boundaries: '范围边界',
  } },
  principle: { label: '引导原则', category: concepts, fields: {
    content: '内容', rationale: '依据', practice: '实践方式', scope: '适用范围',
  } },
  general: { label: '通用资源', fields: {} },
};

export const resourceImages = { frontAssetId: '正面图片', backAssetId: '背面图片' };
export const usageStatuses = { candidate: '备选', selected: '已选用', used: '实际使用' };
export const usageFields = { purpose: '用途', selection: '选择依据', adjustments: '现场调整', feedback: '反馈' };
export const resourceTextLimit = 12000;
export const usageTextLimit = 4000;
export const cardNumberLimit = 80;

export function resourceTemplate(kind) {
  return Object.hasOwn(resourceTemplates, kind) ? resourceTemplates[kind] : undefined;
}

const plain = value => value !== null && typeof value === 'object' &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const nonempty = value => typeof value === 'string' && Boolean(value.trim());

export function validateEventUsage(usage) {
  if (!plain(usage) || !Object.hasOwn(usageStatuses, usage.status) ||
      Object.entries(usage).some(([key, value]) => key !== 'status' &&
        (!Object.hasOwn(usageFields, key) || typeof value !== 'string' || value.length > usageTextLimit))) {
    throw new Error('Event 资源用法无效。');
  }
}

export function resourceImageIds(item) {
  return Object.keys(resourceImages).map(key => item.resourceData?.[key]).filter(Boolean);
}

export function cardNumberKey(number) {
  return number.normalize('NFKC').trim().toLowerCase();
}

export function resourceValidationContext(state) {
  return {
    resources: new Map(state.content.filter(row => !row.deletedAt && isWorkshopWiki(row)).map(row => [row.id, row])),
    assets: new Map(state.assets.map(asset => [asset.id, asset])),
    cardSets: new Set(state.cardSets.map(deck => deck.id)),
  };
}

// Versions keep their own template, card set and links. Only current entries reserve a number.
export function validateResource(row, owner, context, { historical = false } = {}) {
  if ([row.resourceKind, row.resourceData, row.resourceLinks, row.cardSetId].every(value => value === undefined)) return;
  if (!isWorkshopWiki(owner)) throw new Error('结构化资源须属于 Workshop Wiki。');
  const template = resourceTemplate(row.resourceKind);
  if (row.resourceKind !== undefined && (!template || !nonempty(row.title))) throw new Error('请填写标题和有效的资源模板。');
  if (!historical && template?.category && row.discoverCategory !== template.category) {
    throw new Error('资源模板与分类不匹配。');
  }
  if (row.resourceData !== undefined) {
    const data = row.resourceData;
    if (!template || !plain(data)) throw new Error('资源模板字段无效。');
    for (const [key, value] of Object.entries(data)) {
      if (Object.hasOwn(resourceImages, key)) {
        if (!nonempty(value) || !context.assets.has(value) || !validImage(context.assets.get(value))) {
          throw new Error('找不到有效的' + resourceImages[key] + '。');
        }
      } else if (!Object.hasOwn(template.fields, key) || typeof value !== 'string' || value.length > resourceTextLimit) {
        throw new Error('资源模板字段无效：' + key);
      }
    }
  }
  if (row.resourceKind === 'card' || row.resourceKind === 'card_set') {
    if (!nonempty(row.cardSetId) || !context.cardSets.has(row.cardSetId)) throw new Error('请选择有效的所属卡组。');
  } else if (row.cardSetId !== undefined) throw new Error('只有卡组和单卡可以设置卡组 ID。');
  if (row.resourceKind === 'card' && (!nonempty(row.resourceData?.number) ||
      !cardNumberKey(row.resourceData.number) || row.resourceData.number.length > cardNumberLimit)) {
    throw new Error('请输入 1–80 字符的单卡编号。');
  }
  if (row.resourceLinks !== undefined) {
    const links = row.resourceLinks;
    if (!Array.isArray(links) || new Set(links).size !== links.length ||
        links.some(id => !nonempty(id) || id === owner.id || !context.resources.has(id))) {
      throw new Error('资源关联含无效、重复或指向自身的资源。');
    }
  }
}

export function reserveCardIdentity(row, decks, numbers) {
  if (row.resourceKind === 'card_set') {
    if (decks.has(row.cardSetId)) throw new Error('此卡组已有资源条目。');
    decks.add(row.cardSetId);
  }
  if (row.resourceKind === 'card') {
    const key = JSON.stringify([row.cardSetId, cardNumberKey(row.resourceData.number)]);
    if (numbers.has(key)) throw new Error('同一卡组的单卡编号必须唯一。');
    numbers.add(key);
  }
}

export function matchesResourceText(row, needle) {
  return [row.title, row.body, row.summary, row.personalNotes, row.sourceInfo, row.sourceUrl,
    ...(row.topics ?? []), ...(row.tags ?? []), resourceTemplate(row.resourceKind)?.label,
    ...Object.entries(row.resourceData ?? {}).filter(([key]) => !Object.hasOwn(resourceImages, key)).map(([, value]) => value)]
    .join(' ').toLocaleLowerCase().includes(needle);
}

export function matchResourceTemplate(row, kind, missing) {
  if (kind && (row.resourceKind ?? 'general') !== kind) return false;
  if (!missing) return true;
  if (row.resourceKind !== 'card') return false;
  const data = row.resourceData;
  const imagesMissing = !data?.frontAssetId || !data?.backAssetId;
  const descriptionMissing = !data?.description?.trim();
  return ({ image: imagesMissing, description: descriptionMissing, either: imagesMissing || descriptionMissing })[missing] === true;
}

export function cardGallery(state, cardSetId) {
  return state.content.filter(row => row.resourceKind === 'card' && row.cardSetId === cardSetId && !row.deletedAt)
    .sort((a, b) => cardNumberKey(a.resourceData.number).localeCompare(cardNumberKey(b.resourceData.number), undefined, { numeric: true }));
}
