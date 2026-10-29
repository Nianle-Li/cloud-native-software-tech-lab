import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const existingVenue = {
  id: 1, name: '现有场地', location: '体育中心', capacity: 8,
  open_time: '08:00', close_time: '22:00', status: 'OPEN',
}
const venueInput = {
  name: '排练室', location: '教学楼 3 层', capacity: 20,
  open_time: '09:00', close_time: '21:00', status: 'OPEN',
}
const createdVenue = { id: 21, ...venueInput }

function mockApi(create: () => Promise<Response> = async () => Response.json(createdVenue, { status: 201 })) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/venues' && init?.method === 'POST') return create()
    if (String(input) === '/api/venues') return Response.json([existingVenue])
    if (String(input) === '/api/reservations') return Response.json([])
    throw new Error(`Unexpected request: ${String(input)}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  const form = await screen.findByRole('form', { name: '创建场地' })
  await user.type(within(form).getByLabelText('场地名称'), '  排练室  ')
  await user.type(within(form).getByLabelText('所在位置'), '  教学楼 3 层  ')
  fireEvent.change(within(form).getByLabelText('可容纳人数'), { target: { value: '20' } })
  fireEvent.change(within(form).getByLabelText('开放时间'), { target: { value: '09:00' } })
  fireEvent.change(within(form).getByLabelText('关闭时间'), { target: { value: '21:00' } })
  return form
}

beforeEach(() => {
  window.history.replaceState(null, '', '/#/venues/new')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('创建场地流程', () => {
  it('概览与导航提供入口，切换页面后更新标题、焦点和当前导航项', async () => {
    window.history.replaceState(null, '', '/#/')
    mockApi()
    const user = userEvent.setup()
    render(<App />)
    const section = await screen.findByRole('region', { name: '场地列表' })
    await user.click(within(section).getByRole('link', { name: '创建场地' }))
    expect(await screen.findByRole('form', { name: '创建场地' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/venues/new')
    expect(screen.getByRole('heading', { level: 1, name: '创建场地' })).toHaveFocus()
    expect(document.title).toBe('创建场地 | 场地预约系统')
    expect(within(screen.getByRole('navigation')).getByRole('link', { name: '创建场地' })).toHaveAttribute('aria-current', 'page')
  })

  it('直接打开创建页可提交规范字段，成功后清空表单、更新概览并预约新场地', async () => {
    const fetchMock = mockApi()
    const user = userEvent.setup()
    render(<App />)
    const form = await fillForm(user)
    expect(within(form).getByLabelText('场地状态')).toHaveValue('OPEN')
    await user.click(within(form).getByRole('button', { name: '提交场地' }))
    expect(await screen.findByRole('status')).toHaveTextContent('场地创建成功，编号 21')
    expect(fetchMock).toHaveBeenCalledWith('/api/venues', expect.objectContaining({
      method: 'POST', body: JSON.stringify(venueInput),
    }))
    expect(within(form).getByLabelText('场地名称')).toHaveValue('')
    await user.click(screen.getByRole('link', { name: '← 返回场地概览' }))
    expect(await screen.findByRole('link', { name: '预约排练室' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '预约现有场地' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: '预约排练室' }))
    expect(await screen.findByRole('heading', { level: 1, name: '预约 排练室' })).toBeInTheDocument()
    expect(screen.getByRole('form', { name: '创建预约' })).toBeInTheDocument()
  })

  it('可创建停用场地，概览显示该场地且不允许预约', async () => {
    const fetchMock = mockApi(async () => Response.json({ ...createdVenue, status: 'CLOSED' }, { status: 201 }))
    const user = userEvent.setup()
    render(<App />)
    const form = await fillForm(user)
    await user.selectOptions(within(form).getByLabelText('场地状态'), 'CLOSED')
    await user.click(within(form).getByRole('button', { name: '提交场地' }))
    expect(await screen.findByRole('status')).toHaveTextContent('场地创建成功')
    expect(fetchMock).toHaveBeenCalledWith('/api/venues', expect.objectContaining({
      body: JSON.stringify({ ...venueInput, status: 'CLOSED' }),
    }))
    await user.click(screen.getByRole('link', { name: '← 返回场地概览' }))
    expect(await screen.findByRole('heading', { name: '排练室' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '预约排练室' })).not.toBeInTheDocument()
    expect(screen.getByText('已停用', { selector: '.status' })).toBeInTheDocument()
  })

  it.each([
    ['场地名称', '  ', '场地名称须为'],
    ['所在位置', '\t', '所在位置须为'],
    ['可容纳人数', '0', '可容纳人数须为正整数'],
    ['可容纳人数', '1.5', '可容纳人数须为正整数'],
    ['可容纳人数', '2147483648', '可容纳人数须为正整数'],
    ['开放时间', '', '请选择有效的开放时间'],
    ['关闭时间', '09:00', '关闭时间必须晚于开放时间'],
    ['关闭时间', '08:00', '关闭时间必须晚于开放时间'],
  ])('本地拒绝无效的%s（%s），保留输入且不发送创建请求', async (label, value, message) => {
    const fetchMock = mockApi()
    const user = userEvent.setup()
    render(<App />)
    const form = await fillForm(user)
    fireEvent.change(within(form).getByLabelText(label), { target: { value } })
    await user.click(within(form).getByRole('button', { name: '提交场地' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(fetchMock).not.toHaveBeenCalledWith('/api/venues', expect.objectContaining({ method: 'POST' }))
    expect(within(form).getByLabelText('场地名称')).toHaveValue(label === '场地名称' ? value : '  排练室  ')
  })

  it('显示服务端字段错误，跨页保留草稿，修正后可以重试', async () => {
    let attempts = 0
    mockApi(async () => ++attempts === 1
      ? Response.json({ error: { code: 'VALIDATION_ERROR', message: '请求字段无效' }, details: [{ field: 'name', reason: '名称不符合要求' }] }, { status: 400 })
      : Response.json(createdVenue, { status: 201 }))
    const user = userEvent.setup()
    render(<App />)
    const form = await fillForm(user)
    await user.click(within(form).getByRole('button', { name: '提交场地' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('场地名称：名称不符合要求')
    expect(screen.queryByText(/场地创建成功/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: '场地概览' }))
    await user.click(within(screen.getByRole('navigation')).getByRole('link', { name: '创建场地' }))
    const restoredForm = await screen.findByRole('form', { name: '创建场地' })
    expect(within(restoredForm).getByLabelText('场地名称')).toHaveValue('  排练室  ')
    expect(within(restoredForm).getByLabelText('可容纳人数')).toHaveValue(20)
    await user.click(within(restoredForm).getByRole('button', { name: '提交场地' }))
    expect(await screen.findByRole('status')).toHaveTextContent('场地创建成功')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each(['network', 'server', 'invalidResponse'])('创建结果无法确认时（%s）提示刷新场地列表且不伪造成功', async (failure) => {
    mockApi(async () => {
      if (failure === 'network') throw new TypeError('Failed to fetch')
      if (failure === 'server') return Response.json({}, { status: 500 })
      return Response.json({ ...createdVenue, capacity: 99 }, { status: 201 })
    })
    const user = userEvent.setup()
    render(<App />)
    const form = await fillForm(user)
    await user.click(within(form).getByRole('button', { name: '提交场地' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('无法确认创建场地是否成功')
    expect(screen.getByRole('alert')).toHaveTextContent('刷新场地列表')
    expect(screen.getByRole('alert')).not.toHaveTextContent('刷新预约记录')
    expect(within(form).getByLabelText('场地名称')).toHaveValue('  排练室  ')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: '场地概览' }))
    expect(screen.queryByRole('heading', { name: '排练室' })).not.toBeInTheDocument()
  })

  it('请求未完成时禁止编辑及重复提交，切页返回后仍保持提交状态', async () => {
    let finish!: (response: Response) => void
    const fetchMock = mockApi(() => new Promise((resolve) => { finish = resolve }))
    const user = userEvent.setup()
    render(<App />)
    const form = await fillForm(user)
    await user.click(within(form).getByRole('button', { name: '提交场地' }))
    expect(within(form).getByRole('button', { name: '提交中…' })).toBeDisabled()
    expect(within(form).getByLabelText('场地名称')).toBeDisabled()
    fireEvent.submit(form)
    await user.click(screen.getByRole('link', { name: '场地概览' }))
    await user.click(within(screen.getByRole('navigation')).getByRole('link', { name: '创建场地' }))
    const pendingForm = await screen.findByRole('form', { name: '创建场地' })
    expect(within(pendingForm).getByRole('button', { name: '提交中…' })).toBeDisabled()
    fireEvent.submit(pendingForm)
    expect(fetchMock.mock.calls.filter(([path, init]) => String(path) === '/api/venues' && init?.method === 'POST')).toHaveLength(1)
    await act(async () => { finish(Response.json(createdVenue, { status: 201 })) })
    expect(await screen.findByRole('status')).toHaveTextContent('场地创建成功')
    expect(within(pendingForm).getByLabelText('场地名称')).toBeEnabled()
    expect(within(pendingForm).getByLabelText('场地名称')).toHaveValue('')
  })

  it.each(['success', 'failure'])('创建成功前发出的场地列表请求晚到（%s）时不会覆盖新场地或报告过期错误', async (outcome) => {
    let finishList!: (response: Response) => void
    let failList!: (reason: Error) => void
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/venues' && init?.method === 'POST') return Response.json(createdVenue, { status: 201 })
      if (String(input) === '/api/venues') return new Promise<Response>((resolve, reject) => { finishList = resolve; failList = reject })
      return Response.json([])
    }))
    const user = userEvent.setup()
    render(<App />)
    const form = await fillForm(user)
    await user.click(within(form).getByRole('button', { name: '提交场地' }))
    expect(await screen.findByRole('status')).toHaveTextContent('场地创建成功')
    await act(async () => {
      if (outcome === 'success') finishList(Response.json([existingVenue]))
      else failList(new TypeError('Failed to fetch'))
    })
    await user.click(screen.getByRole('link', { name: '← 返回场地概览' }))
    expect(await screen.findByRole('link', { name: '预约排练室' })).toBeInTheDocument()
    if (outcome === 'success') expect(screen.getByRole('link', { name: '预约现有场地' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('正在加载场地…')).not.toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
