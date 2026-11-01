import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestJson } from './client'

afterEach(() => vi.unstubAllGlobals())

describe('API 参数错误反馈', () => {
  it('把服务端字段详情转换为用户可理解的字段提示', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      error: { code: 'VALIDATION_ERROR', message: '请求字段无效' },
      details: [{ field: 'start_time', reason: '不能早于场地开放时间' }],
    }, { status: 400 })))

    await expect(requestJson('/reservations')).rejects.toThrow('开始时间：不能早于场地开放时间')
  })

  it('无有效详情时保留服务端的通用错误消息', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      error: { code: 'VALIDATION_ERROR', message: '请求字段无效' },
      details: [{ field: 'unknown_field', reason: '内部字段' }],
    }, { status: 400 })))

    await expect(requestJson('/reservations')).rejects.toThrow('请求字段无效')
  })
})
