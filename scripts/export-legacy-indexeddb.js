// Run in the old Dashboard's browser console. Reads one selected database and downloads a local archive.
(async () => {
  if (location.origin !== 'https://workshop-creation-workspace-zy.cho-eki0915.chatgpt.site') {
    throw new Error('请在旧 Workshop Dashboard 的页面运行。');
  }
  const databases = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
  const name = window.prompt('要导出的 IndexedDB 名称\n' + databases.map(db => db.name + ' · v' + db.version).join('\n'));
  if (!name) return;

  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => request.transaction.abort();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('无法打开已有数据库：' + name));
  });
  const version = db.version;
  const names = [...db.objectStoreNames];
  let stores;
  try {
    stores = names.length ? await new Promise((resolve, reject) => {
      const transaction = db.transaction(names, 'readonly');
      const result = names.map(name => {
        const store = transaction.objectStore(name);
        const rows = [];
        const cursor = store.openCursor();
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (!row) return;
          rows.push({ key: row.primaryKey, value: row.value });
          row.continue();
        };
        const indexes = [...store.indexNames].map(name => {
          const index = store.index(name);
          return { name, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
        });
        return { name, keyPath: store.keyPath, autoIncrement: store.autoIncrement, indexes, rows };
      });
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error ?? new Error('读取已中断。'));
    }) : [];
  } finally {
    db.close();
  }

  function base64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  }

  async function encode(value, ancestors = new Set()) {
    if (value === undefined) return { $undefined: true };
    if (typeof value === 'bigint') return { $bigint: String(value) };
    if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0))) {
      return { $number: Object.is(value, -0) ? '-0' : String(value) };
    }
    if (value === null || typeof value !== 'object') return value;
    if (value instanceof Date) return { $date: value.toJSON() };
    if (value instanceof Blob) return { $blob: {
      name: value instanceof File ? value.name : undefined,
      lastModified: value instanceof File ? value.lastModified : undefined,
      mime: value.type, size: value.size, data: base64(new Uint8Array(await value.arrayBuffer())),
    } };
    if (value instanceof ArrayBuffer) return { $binary: { type: 'ArrayBuffer', data: base64(new Uint8Array(value)) } };
    if (ArrayBuffer.isView(value)) return { $binary: { type: value.constructor.name,
      data: base64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) } };
    if (value instanceof RegExp) return { $regexp: { source: value.source, flags: value.flags } };
    if (ancestors.has(value)) throw new Error('发现循环引用。请保留旧数据库，调整导出方式后重试。');
    const path = new Set([...ancestors, value]);
    if (value instanceof Map) return { $map: await encode([...value], path) };
    if (value instanceof Set) return { $set: await encode([...value], path) };
    if (Array.isArray(value)) return Promise.all(Array.from(value, row => encode(row, path)));
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new Error('发现未支持的 IndexedDB 值：' + value.constructor?.name);
    }
    if (Object.keys(value).some(key => /^\$(undefined|bigint|number|date|blob|binary|regexp|map|set|object)$/.test(key))) {
      return { $object: await Promise.all(Object.entries(value).map(async ([key, row]) => [key, await encode(row, path)])) };
    }
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, row]) => [key, await encode(row, path)])));
  }

  for (const store of stores) {
    for (const row of store.rows) {
      row.key = await encode(row.key);
      row.value = await encode(row.value);
    }
  }
  const archive = { format: 'yistudio-indexeddb-v1', origin: location.origin, database: name, version,
    exportedAt: new Date().toISOString(), stores };
  const url = URL.createObjectURL(new Blob([JSON.stringify(archive)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'workshop-indexeddb-' + name + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
})().catch(error => console.error('Workshop 导出失败', error));
