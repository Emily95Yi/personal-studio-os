import { cardGallery, cardNumberKey, cardNumberLimit, resourceTemplate, resourceTextLimit } from './workshop-resource-data.js';
import { saveWiki, wikiRecords, wikiStatus, wikiStatuses } from './workshop-library.js';

export const cardTextFormat = 'yi-studio-card-wiki-batch-v1';

function textFields(data, kind) {
  const allowed = resourceTemplate(kind).fields;
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.entries(data).some(([key, value]) =>
    !Object.hasOwn(allowed, key) || typeof value !== 'string' || value.length > resourceTextLimit)) {
    throw new Error('卡组或单卡文字字段无效。');
  }
  return data;
}

function hasChanges(previous, input) {
  return !previous || previous.title !== input.title || (input.body !== undefined && previous.body !== input.body) ||
    Object.entries(input.resourceData).some(([key, value]) => previous.resourceData?.[key] !== value);
}

export function previewCardTextImport(state, batch) {
  const { deck, cards } = batch;
  if (batch.format !== cardTextFormat || batch.schemaVersion !== 1 || batch.contentMode !== 'text-only' ||
    !Array.isArray(batch.assets) || batch.assets.length || !deck || deck.resourceKind !== 'card_set' ||
    typeof deck.name !== 'string' || !Array.isArray(cards) || !cards.length || !Object.hasOwn(wikiStatuses, deck.status)) {
    throw new Error('请选择只含文字的卡组 JSON。');
  }
  const targets = wikiRecords(state).filter(row => row.resourceKind === 'card_set' && row.title === deck.name && !row.deletedAt);
  if (targets.length !== 1) throw new Error('须有一个名称完全匹配的卡组。');
  const target = targets[0];
  const existing = new Map(cardGallery(state, target.cardSetId).map(row => [cardNumberKey(row.resourceData.number), row]));
  const deckInput = { id: target.id, title: target.title, wikiStatus: wikiStatus(target),
    resourceData: { ...target.resourceData, ...textFields(deck.resourceData, 'card_set') } };
  const numbers = new Set();
  const rows = cards.map(card => {
    if (!card) throw new Error('单卡格式无效。');
    const { number, title, resourceData } = card;
    if (card.resourceKind !== 'card' || typeof title !== 'string' || !title.trim() || title.length > 200 ||
      typeof number !== 'string' || !number.trim() || number.length > cardNumberLimit || resourceData?.number !== number) {
      throw new Error('单卡编号、标题或格式无效。');
    }
    const key = cardNumberKey(number);
    if (numbers.has(key)) throw new Error('卡号重复：' + number);
    numbers.add(key);
    const previous = existing.get(key);
    const input = { id: previous?.id, title: title.trim(), cardSetId: target.cardSetId, resourceKind: 'card',
      discoverCategory: target.discoverCategory, folderId: previous?.folderId ?? target.folderId,
      wikiStatus: previous ? wikiStatus(previous) : deck.status,
      resourceData: { ...previous?.resourceData, ...textFields(resourceData, 'card') } };
    // Older imports copied the obsolete Wiki caption into the body as well.
    if (previous?.body?.startsWith('旧 Wiki 图像描述：') && previous.sourceInfo?.includes(' · 白卡 ' + number)) input.body = '';
    return { number, input, status: previous ? (hasChanges(previous, input) ? 'updated' : 'same') : 'added' };
  });
  const added = rows.filter(row => row.status === 'added');
  const updated = rows.filter(row => row.status === 'updated');
  return { deckInput, deckChanged: hasChanges(target, deckInput), added, updated };
}

export function importCardText(state, batch, expectedRevision) {
  if (state.revision !== expectedRevision) throw new Error('Studio 数据已变化，请重新预览。');
  const plan = previewCardTextImport(state, batch);
  const snapshot = { ...state, content: [...state.content] };
  if (plan.deckChanged) saveWiki(snapshot, plan.deckInput);
  for (const { input } of [...plan.added, ...plan.updated]) saveWiki(snapshot, input);
  state.content = snapshot.content;
  return plan;
}
