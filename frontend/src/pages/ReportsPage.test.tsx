import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReportsPage } from './ReportsPage'

const jobId = 'venue-report-20261115-001'
const running = {
  job_id: jobId, source: 'SCHEDULED', start_date: '2026-11-15', end_date: '2026-11-15',
  status: 'RUNNING', started_at: '2026-11-15T10:00:00+08:00',
  finished_at: null, generated_at: null, error_summary: null, items: [],
}
const succeeded = {
  ...running, status: 'SUCCEEDED', finished_at: '2026-11-15T10:00:03+08:00',
  generated_at: '2026-11-15T10:00:03+08:00',
  items: [
    { venue_id: 1, venue_name: '羽毛球馆', reservation_count: 2, reserved_minutes: 90 },
    { venue_id: 2, venue_name: '零预约场地', reservation_count: 0, reserved_minutes: 0 },
  ],
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function queryReport() {
  const user = userEvent.setup()
  await user.type(screen.getByRole('textbox', { name: 'Job ID' }), jobId)
  await user.click(screen.getByRole('button', { name: '查询报告' }))
  return user
}

describe('只读报告页', () => {
  it('输入 Job ID 查询持久化报告，展示全部场地和零值，并允许手动刷新', async () => {
    const fetchMock = vi.fn(async () => Response.json(succeeded))
    vi.stubGlobal('fetch', fetchMock)
    render(<ReportsPage />)
    const user = await queryReport()
    expect(await screen.findByRole('row', { name: /羽毛球馆/ })).toHaveTextContent('90')
    expect(screen.getByRole('row', { name: /零预约场地/ })).toBeInTheDocument()
    expect(screen.getByText('已成功')).toBeInTheDocument()
    expect(screen.getByText('自动任务')).toBeInTheDocument()
    expect(screen.getAllByText('2026-11-15T10:00:03+08:00')).toHaveLength(2)
    expect(screen.getByRole('row', { name: /零预约场地/ })).toHaveTextContent('0')
    await user.click(screen.getByRole('button', { name: '刷新报告' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/reports/${jobId}`, undefined)
  })

  it('运行超过 40 分钟只提示核对 Kubernetes Job，不自动判断终态', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-15T02:41:00Z'))
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(running)))
    render(<ReportsPage />)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.type(screen.getByRole('textbox', { name: 'Job ID' }), jobId)
    await user.click(screen.getByRole('button', { name: '查询报告' }))
    expect(await screen.findByText('运行中')).toBeInTheDocument()
    expect(screen.getByText(/核对 Kubernetes Job/)).toBeInTheDocument()
    expect(screen.queryByText('已成功')).not.toBeInTheDocument()
    expect(screen.queryByText('已失败')).not.toBeInTheDocument()
  })

  it('失败提示可能继续重试；404、断网与无效响应各有不同反馈', async () => {
    let answer: () => Promise<Response> = async () => Response.json({
      ...running, status: 'FAILED', finished_at: '2026-11-15T10:00:03+08:00',
      error_summary: '报告生成失败，请查看 Job 日志',
    })
    vi.stubGlobal('fetch', vi.fn(() => answer()))
    render(<ReportsPage />)
    const user = await queryReport()
    expect(await screen.findByText('已失败')).toBeInTheDocument()
    expect(screen.getByText(/可能继续重试/)).toBeInTheDocument()

    answer = async () => Response.json({ error: { code: 'REPORT_NOT_FOUND', message: '暂无报告运行记录' } }, { status: 404 })
    await user.click(screen.getByRole('button', { name: '刷新报告' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('数据库暂无运行记录')

    answer = async () => { throw new Error('offline') }
    await user.click(screen.getByRole('button', { name: '刷新报告' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('网络')

    answer = async () => Response.json({ status: 'SUCCEEDED' })
    await user.click(screen.getByRole('button', { name: '刷新报告' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('无效数据')
  })

  it('非法 ID 不发请求，编辑输入后不把旧报告当作新 ID 的结果', async () => {
    const fetchMock = vi.fn(async () => Response.json(succeeded))
    vi.stubGlobal('fetch', fetchMock)
    render(<ReportsPage />)
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: 'Job ID' }), 'BAD-ID')
    await user.click(screen.getByRole('button', { name: '查询报告' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Job ID')
    expect(fetchMock).not.toHaveBeenCalled()

    await user.clear(screen.getByRole('textbox', { name: 'Job ID' }))
    await user.type(screen.getByRole('textbox', { name: 'Job ID' }), jobId)
    await user.click(screen.getByRole('button', { name: '查询报告' }))
    expect(await screen.findByRole('row', { name: /羽毛球馆/ })).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Job ID' }), '-next')
    expect(screen.queryByRole('row', { name: /羽毛球馆/ })).not.toBeInTheDocument()
  })

  it('较早的慢响应不能覆盖后一次查询结果', async () => {
    let resolveFirst!: (response: Response) => void
    const first = new Promise<Response>((resolve) => { resolveFirst = resolve })
    const nextId = 'venue-report-20261115-002'
    vi.stubGlobal('fetch', vi.fn((path: RequestInfo | URL) => String(path).endsWith(jobId)
      ? first : Promise.resolve(Response.json({ ...succeeded, job_id: nextId, items: [] }))))
    render(<ReportsPage />)
    const user = await queryReport()
    await user.clear(screen.getByRole('textbox', { name: 'Job ID' }))
    await user.type(screen.getByRole('textbox', { name: 'Job ID' }), nextId)
    await user.click(screen.getByRole('button', { name: '查询报告' }))
    expect(await screen.findByText('本次报告没有场地明细。')).toBeInTheDocument()
    await act(async () => { resolveFirst(Response.json(succeeded)); await first })
    expect(screen.queryByRole('row', { name: /羽毛球馆/ })).not.toBeInTheDocument()
  })
})
