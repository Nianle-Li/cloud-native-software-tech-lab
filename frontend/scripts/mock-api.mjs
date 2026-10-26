import { createMockApiServer } from './mock-api-core.mjs'

createMockApiServer().listen(8081, '127.0.0.1', () => {
  console.log('本地模拟 API 已启动：http://127.0.0.1:8081（数据仅保存在进程内）')
})
