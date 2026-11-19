import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportApi } from './reports'

const succeeded = {
  job_id: 'venue-report-20261115-001', source: 'MANUAL',
  start_date: '2026-11-15', end_date: '2026-11-15', status: 'SUCCEEDED',
  started_at: '2026-11-15T10:00:00.123456+08:00',
  finished_at: '2026-11-15T10:00:03+08:00',
  generated_at: '2026-11-15T10:00:03+08:00', error_summary: null,
  items: [
    { venue_id: 1, venue_name: '羽毛球馆', reservation_count: 2, reserved_minutes: 90 },
    { venue_id: 2, venue_name: '零预约场地', reservation_count: 0, reserved_minutes: 0 },
  ],
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('报告查询接口', () => {
  it('使用同源 API 查询，并接受成功、运行中和可重试的失败状态', async () => {
    const fetchMock = vi.fn(async () => Response.json(succeeded))
    vi.stubGlobal('fetch', fetchMock)
    await expect(reportApi.get(succeeded.job_id)).resolves.toEqual(succeeded)
    expect(fetchMock).toHaveBeenCalledWith(`/api/reports/${succeeded.job_id}`, { signal: expect.any(AbortSignal) })

    const running = { ...succeeded, status: 'RUNNING', finished_at: null, generated_at: null, items: [] }
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(running)))
    await expect(reportApi.get(succeeded.job_id)).resolves.toEqual(running)

    const failed = { ...running, status: 'FAILED', finished_at: succeeded.finished_at, error_summary: '报告生成失败，请查看 Job 日志' }
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(failed)))
    await expect(reportApi.get(succeeded.job_id)).resolves.toEqual(failed)
  })

  it('在发送请求前拒绝非法 ID，并将 404 保留为独立错误', async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: { code: 'REPORT_NOT_FOUND', message: '暂无报告运行记录' } }, { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(reportApi.get('Bad/ID')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(fetchMock).not.toHaveBeenCalled()
    await expect(reportApi.get('venue-report-20261115-001')).rejects.toMatchObject({ status: 404, code: 'REPORT_NOT_FOUND' })
  })

  it('查询超过 15 秒时中止请求，并将超时与报告任务状态区分', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_path: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const pending = reportApi.get(succeeded.job_id)
    const signal = fetchMock.mock.calls[0]?.[1]?.signal
    expect(signal).toBeInstanceOf(AbortSignal)
    const rejection = expect(pending).rejects.toMatchObject({ status: 0, code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(15_000)
    await rejection
    expect(signal?.aborted).toBe(true)
  })

  it.each([
    ['ID 不一致', { ...succeeded, job_id: 'another-job' }],
    ['结束日期早于开始日期', { ...succeeded, end_date: '2026-11-14' }],
    ['成功状态缺少完成时间', { ...succeeded, finished_at: null }],
    ['未成功却带明细', { ...succeeded, status: 'RUNNING', finished_at: null, generated_at: null }],
    ['失败状态没有摘要', { ...succeeded, status: 'FAILED', generated_at: null, items: [], error_summary: null }],
    ['分钟数为负', { ...succeeded, items: [{ ...succeeded.items[0], reserved_minutes: -1 }] }],
    ['时间戳没有时区', { ...succeeded, started_at: '2026-11-15T10:00:00' }],
    ['时间戳使用不存在的日期', { ...succeeded, started_at: '2026-02-30T10:00:00+08:00' }],
    ['场地明细乱序', { ...succeeded, items: [...succeeded.items].reverse() }],
  ])('拒绝%s的响应', async (_reason, body) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(body)))
    await expect(reportApi.get(succeeded.job_id)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
})
