# Workshop 数据迁移

旧 Dashboard 的实际库名、版本、数据表和原生导出格式尚未核对。浏览器打开旧站时转至 OpenAI 登录域，自动审批拒绝了访问。以下流程使用测试库验证。处理实际数据时，先在已登录的旧站确认是否有原生导出，并检查它是否包含原始 Markdown、版本、关系和附件字节。

## 导出与映射

1. 在旧域名保存完整导出。若没有可用的原生导出，检查并在旧 Dashboard 的浏览器控制台运行 [只读导出脚本](../scripts/export-legacy-indexeddb.js)，选择需要读取的 IndexedDB。脚本会记录表、主键、索引、版本和记录。Blob / File 保存为 `$blob`，内含 Base64 字节、MIME 类型、大小及可用的文件名。若资料在其他数据库，分别导出。保留原始导出文件。
2. 根据导出中的实际字段编写映射。活动系列进 Project，单次实践进 Event，文档和草稿进所属 Project / Event 的 Session。Review 放在 Event。素材、Pin、灵感、Wiki、知识和来源进 Discover，原类型、正文、来源、时间及已有标签按原值复制。只有目标明确时才映射关系。归属不明和已退役流程的数据保留在原始导出中。
3. 在 **Workshop → 数据迁移** 选择原始导出与映射文件，点击 **预览**。核对新增、重复、冲突、封面、附件、文档版本和关联数。检查保留清单，确认后导入。重复导入同一份映射会识别相同记录。同 ID 的不同记录、断开的引用或重复关联会阻止写入。导入是单次事务。
4. 抽查正文、海报、附件下载、历史版本和关联跳转。使用 **导出 Studio** 保存导入后的迁移包。原始导出和映射文件仍可用于复核。

## 映射文件

`format` 为 `yistudio-mapping-v1`，`database` 和 `version` 与原始导出一致。为同一旧库固定 `namespace`。每条规则包含 `store` 和 `outputs`，可用 `when: { "path": ["type"], "equals": "wiki" }` 区分同表记录。输出的 `to` 为 `projects`、`events`、`content`、`sessions`、`assets` 或 `relations`，`fields` 描述目标记录。文档和 Blob 可以来自同一条原记录，用不同的 `slot` 生成独立 ID。

- `{ "$field": ["markdown"] }` 读取原字段。嵌套 Blob 字节可用 `["poster", "$blob", "data"]`。如果原 Blob 没有文件名，可提供固定文件名作为附件标签。
- `{ "$id": "poster" }` 引用同一条原记录的输出。用 `{ "$id": "v1" }` 可给旧文档版本分配稳定 ID。
- `{ "$ref": { "store": "events", "path": ["eventId"] } }` 引用另一表的记录。也可以用 `key` 指定原主键，用 `slot` 指定输出或版本。
- 未匹配的记录会进入保留清单。确认只保留原始数据时，规则可写 `"outputs": [], "keepRaw": true`。保留清单记录表和主键，正文留在原始导出。

[测试导出和完整映射](../site/studio-fixture.js) 展示了正文、Blob、版本继承、Event Review 和关联。也可在迁移页点击 **预览测试数据**。已映射的 `yistudio-transfer-v1` 迁移包可以直接预览。导入文件上限为 50 MB，单个附件上限为 12 MB。Workshop 和 Discover 的数据保存在当前浏览器及当前域名的 IndexedDB 中。
