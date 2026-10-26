import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const venue = {
  id: 1,
  name: '羽毛球馆 A',
  location: '体育中心 1 层',
  capacity: 8,
  open_time: '08:00',
  close_time: '22:00',
  status: 'OPEN',
}

const reservation = {
  id: 12,
  venue_id: 1,
  booked_by: '软件技术小组',
  reservation_date: '2030-10-30',
  start_time: '10:00',
  end_time: '11:00',
  attendee_count: 3,
  purpose: '小组活动',
  status: 'ACTIVE',
  created_at: '2030-10-01T10:00:00+08:00',
  cancelled_at: null,
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-26T01:30:30Z'))
  window.history.replaceState(null, '', '/#/venues/1/book')
})

async function fillReservationForm(user: ReturnType<typeof userEvent.setup>, form: HTMLElement) {
  await user.type(within(form).getByLabelText('预约人或组织'), '软件技术小组')
  await user.type(within(form).getByLabelText('预约日期'), '2030-10-30')
  await user.type(within(form).getByLabelText('开始时间'), '10:00')
  await user.type(within(form).getByLabelText('结束时间'), '11:00')
  await user.clear(within(form).getByLabelText('参与人数'))
  await user.type(within(form).getByLabelText('参与人数'), '3')
  await user.type(within(form).getByLabelText('使用目的'), '小组活动')
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('场地预约页面', () => {
  it('加载场地后可创建预约并显示服务端返回的记录', async () => {
    window.history.replaceState(null, '', '/#/')
    const user = userEvent.setup()
    let reservations: unknown[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path === '/api/venues') return json([venue])
      if (path === '/api/reservations' && (!init || init.method === 'GET')) return json(reservations)
      if (path === '/api/reservations' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({
          venue_id: 1,
          booked_by: '软件技术小组',
          reservation_date: '2030-10-30',
          start_time: '10:00',
          end_time: '11:00',
          attendee_count: 3,
          purpose: '小组活动',
        })
        reservations = [reservation]
        return json(reservation, 201)
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    expect(await screen.findByText('体育中心 1 层')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: '预约羽毛球馆 A' }))

    const form = await screen.findByRole('form', { name: '创建预约' })
    await user.type(within(form).getByLabelText('预约人或组织'), '软件技术小组')
    await user.type(within(form).getByLabelText('预约日期'), '2030-10-30')
    await user.type(within(form).getByLabelText('开始时间'), '10:00')
    await user.type(within(form).getByLabelText('结束时间'), '11:00')
    await user.clear(within(form).getByLabelText('参与人数'))
    await user.type(within(form).getByLabelText('参与人数'), '3')
    await user.type(within(form).getByLabelText('使用目的'), '小组活动')
    await user.click(within(form).getByRole('button', { name: '提交预约' }))

    expect(await screen.findByText('预约成功，编号 12')).toBeInTheDocument()
    expect(form.compareDocumentPosition(screen.getByText('预约成功，编号 12')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(form).getByLabelText('预约人或组织')).toHaveValue('')
    await user.click(screen.getByRole('link', { name: '预约记录' }))
    expect(await screen.findByText('软件技术小组')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/reservations',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('显示后端返回的冲突错误，不伪造预约成功', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path === '/api/venues') return json([venue])
      if (path === '/api/reservations' && !init) return json([])
      if (path === '/api/reservations' && init?.method === 'POST') {
        return json({ error: { code: 'TIME_CONFLICT', message: '该场地在所选时段已被预约' } }, 409)
      }
      throw new Error(`Unexpected request: ${path}`)
    }))

    render(<App />)
    const form = await screen.findByRole('form', { name: '创建预约' })
    await user.type(within(form).getByLabelText('预约人或组织'), '软件技术小组')
    await user.type(within(form).getByLabelText('预约日期'), '2030-10-30')
    await user.type(within(form).getByLabelText('开始时间'), '10:00')
    await user.type(within(form).getByLabelText('结束时间'), '11:00')
    await user.type(within(form).getByLabelText('使用目的'), '小组活动')
    await user.click(within(form).getByRole('button', { name: '提交预约' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('该场地在所选时段已被预约')
    expect(within(screen.getByRole('region', { name: '预约场地' })).getByRole('alert')).toHaveTextContent('该场地在所选时段已被预约')
    expect(screen.queryByText(/预约成功，编号/)).not.toBeInTheDocument()
  })

  it('参数错误时显示服务端原因并保留预约表单内容', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path === '/api/venues') return json([venue])
      if (path === '/api/reservations' && !init) return json([])
      if (path === '/api/reservations' && init?.method === 'POST') {
        return json({ error: { code: 'VALIDATION_ERROR', message: '预约信息不符合服务端规则' } }, 400)
      }
      throw new Error(`Unexpected request: ${path}`)
    }))

    render(<App />)
    const form = await screen.findByRole('form', { name: '创建预约' })
    await fillReservationForm(user, form)
    await user.click(within(form).getByRole('button', { name: '提交预约' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('预约信息不符合服务端规则')
    expect(within(form).getByLabelText('预约日期')).toHaveValue('2030-10-30')
    expect(screen.queryByText(/预约成功，编号/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: '预约记录' }))
    expect(screen.getByText('暂无预约记录。')).toBeInTheDocument()
  })

  it('本地拦截过期预约且保留表单内容，不发送创建请求', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input)
      if (path === '/api/venues') return json([venue])
      if (path === '/api/reservations') return json([])
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    const form = await screen.findByRole('form', { name: '创建预约' })
    await fillReservationForm(user, form)
    await user.clear(within(form).getByLabelText('预约日期'))
    await user.type(within(form).getByLabelText('预约日期'), '2020-10-30')
    await user.click(within(form).getByRole('button', { name: '提交预约' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('预约日期不能早于今天')
    expect(within(form).getByLabelText('预约日期')).toHaveValue('2020-10-30')
    expect(fetchMock).not.toHaveBeenCalledWith('/api/reservations', expect.objectContaining({ method: 'POST' }))
  })

  it('取消预约后显示服务端确认的状态', async () => {
    window.history.replaceState(null, '', '/#/reservations')
    const user = userEvent.setup()
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path === '/api/venues') return json([venue])
      if (path === '/api/reservations') return json([reservation])
      if (path === '/api/reservations/12/cancel' && init?.method === 'POST') {
        return json({ ...reservation, status: 'CANCELLED', cancelled_at: '2030-10-01T11:00:00+08:00' })
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    expect(await screen.findByText('软件技术小组')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '取消预约 12' }))
    expect(await screen.findByText('已取消')).toBeInTheDocument()
    const cancelledCard = screen.getByRole('heading', { name: '预约 #12' }).closest('li')!
    expect(within(cancelledCard).getByText('预约 12 已取消')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/reservations/12/cancel',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('API 返回错误结构时显示错误，不崩溃', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/venues') return json({ unexpected: true })
      if (String(input) === '/api/reservations') return json([])
      throw new Error('Unexpected request')
    }))

    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('服务器返回了无效数据')
    expect(screen.queryByRole('form', { name: '创建预约' })).not.toBeInTheDocument()
  })

  it('场地停用时显示状态且不提供预约表单', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/venues') return json([{ ...venue, status: 'CLOSED' }])
      if (String(input) === '/api/reservations') return json([])
      throw new Error('Unexpected request')
    }))

    render(<App />)
    expect(await screen.findByText('该场地已停用，无法预约。')).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: '创建预约' })).not.toBeInTheDocument()
  })

  it('取消失败时保留原状态并显示服务端错误', async () => {
    window.history.replaceState(null, '', '/#/reservations')
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path === '/api/venues') return json([venue])
      if (path === '/api/reservations') return json([reservation])
      if (path === '/api/reservations/12/cancel' && init?.method === 'POST') {
        return json({ error: { code: 'RESERVATION_NOT_FOUND', message: '预约不存在' } }, 404)
      }
      throw new Error(`Unexpected request: ${path}`)
    }))

    render(<App />)
    await user.click(await screen.findByRole('button', { name: '取消预约 12' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('预约不存在')
    expect(within(screen.getByRole('region', { name: '全部记录' })).getByRole('alert')).toHaveTextContent('预约不存在')
    expect(screen.getByText('有效')).toBeInTheDocument()
  })

  it('创建成功后忽略晚到的旧预约列表', async () => {
    const user = userEvent.setup()
    let resolveInitialList!: (response: Response) => void
    const initialList = new Promise<Response>((resolve) => { resolveInitialList = resolve })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path === '/api/venues') return json([venue])
      if (path === '/api/reservations' && !init) return initialList
      if (path === '/api/reservations' && init?.method === 'POST') return json(reservation, 201)
      throw new Error(`Unexpected request: ${path}`)
    }))

    render(<App />)
    const form = await screen.findByRole('form', { name: '创建预约' })
    await fillReservationForm(user, form)
    await user.click(within(form).getByRole('button', { name: '提交预约' }))
    expect(await screen.findByText('预约成功，编号 12')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: '预约记录' }))
    expect(screen.getByText('软件技术小组')).toBeInTheDocument()

    await act(async () => { resolveInitialList(json([])); await initialList })
    expect(screen.getByText('软件技术小组')).toBeInTheDocument()
  })

  it('列表已包含新预约时，创建响应不会插入重复记录', async () => {
    const user = userEvent.setup()
    let resolveList!: (response: Response) => void
    let resolveCreation!: (response: Response) => void
    const list = new Promise<Response>((resolve) => { resolveList = resolve })
    const creation = new Promise<Response>((resolve) => { resolveCreation = resolve })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path === '/api/venues') return json([venue])
      if (path === '/api/reservations' && !init) return list
      if (path === '/api/reservations' && init?.method === 'POST') return creation
      throw new Error(`Unexpected request: ${path}`)
    }))

    render(<App />)
    const form = await screen.findByRole('form', { name: '创建预约' })
    await fillReservationForm(user, form)
    fireEvent.submit(form)
    await act(async () => { resolveList(json([reservation])); await list })

    await act(async () => { resolveCreation(json(reservation, 201)); await creation })
    expect(await screen.findByText('预约成功，编号 12')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: '预约记录' }))
    expect(screen.getAllByText('软件技术小组')).toHaveLength(1)
  })

  it('预约列表初次加载失败后，创建成功能显示记录并清除旧错误', async () => {
    window.history.replaceState(null, '', '/#/reservations')
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path === '/api/venues') return json([venue])
      if (path === '/api/reservations' && !init) return json({ error: { code: 'INTERNAL_ERROR' } }, 503)
      if (path === '/api/reservations' && init?.method === 'POST') return json(reservation, 201)
      throw new Error(`Unexpected request: ${path}`)
    }))

    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('服务器暂时不可用')
    await user.click(screen.getByRole('link', { name: '场地概览' }))
    await user.click(await screen.findByRole('link', { name: '预约羽毛球馆 A' }))
    const form = await screen.findByRole('form', { name: '创建预约' })
    await fillReservationForm(user, form)
    await user.click(within(form).getByRole('button', { name: '提交预约' }))

    expect(await screen.findByText('预约成功，编号 12')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: '预约记录' }))
    expect(screen.getByText('软件技术小组')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('场地加载失败后可手动重试并恢复预约表单', async () => {
    const user = userEvent.setup()
    let attempts = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input)
      if (path === '/api/venues') {
        attempts += 1
        return attempts === 1 ? json({ error: { code: 'INTERNAL_ERROR' } }, 503) : json([venue])
      }
      if (path === '/api/reservations') return json([])
      throw new Error(`Unexpected request: ${path}`)
    }))

    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('服务器暂时不可用')
    await user.click(screen.getByRole('button', { name: '刷新场地列表' }))

    expect(await screen.findByRole('form', { name: '创建预约' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('预约记录加载失败后可手动重试并显示服务器记录', async () => {
    window.history.replaceState(null, '', '/#/reservations')
    const user = userEvent.setup()
    let attempts = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input)
      if (path === '/api/venues') return json([venue])
      if (path === '/api/reservations') {
        attempts += 1
        return attempts === 1 ? json({ error: { code: 'INTERNAL_ERROR' } }, 503) : json([reservation])
      }
      throw new Error(`Unexpected request: ${path}`)
    }))

    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('服务器暂时不可用')
    await user.click(screen.getByRole('button', { name: '刷新预约记录' }))

    expect(await screen.findByText('软件技术小组')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('创建请求未完成时不会重复发送 POST', async () => {
    const user = userEvent.setup()
    let resolveCreation!: (response: Response) => void
    const creation = new Promise<Response>((resolve) => { resolveCreation = resolve })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path === '/api/venues') return json([venue])
      if (path === '/api/reservations' && !init) return json([])
      if (path === '/api/reservations' && init?.method === 'POST') return creation
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    const form = await screen.findByRole('form', { name: '创建预约' })
    await fillReservationForm(user, form)
    act(() => { fireEvent.submit(form); fireEvent.submit(form) })

    expect(fetchMock.mock.calls.filter(([path, init]) => path === '/api/reservations' && init?.method === 'POST')).toHaveLength(1)
    expect(within(form).getByRole('button', { name: '提交中…' })).toBeDisabled()
    await act(async () => { resolveCreation(json(reservation, 201)); await creation })
    expect(await screen.findByText('预约成功，编号 12')).toBeInTheDocument()
  })

  it('创建请求断网时提示先核对记录，刷新后显示服务器结果', async () => {
    const user = userEvent.setup()
    let listAttempts = 0
    let createAttempts = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path === '/api/venues') return json([venue])
      if (path === '/api/reservations' && !init) {
        listAttempts += 1
        return json(listAttempts === 1 ? [] : [reservation])
      }
      if (path === '/api/reservations' && init?.method === 'POST') {
        createAttempts += 1
        throw new Error('网络中断，响应未到达')
      }
      throw new Error(`Unexpected request: ${path}`)
    }))

    render(<App />)
    const form = await screen.findByRole('form', { name: '创建预约' })
    await fillReservationForm(user, form)
    await user.click(within(form).getByRole('button', { name: '提交预约' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('先刷新预约记录')
    expect(within(form).getByLabelText('预约人或组织')).toHaveValue('软件技术小组')
    expect(createAttempts).toBe(1)
    await user.click(screen.getByRole('link', { name: '预约记录' }))
    await user.click(screen.getByRole('button', { name: '刷新预约记录' }))
    expect(await screen.findByText('软件技术小组')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(createAttempts).toBe(1)
  })

  it('提交结果未知时，前往记录页核对再返回预约页仍保留草稿', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path === '/api/venues') return json([venue])
      if (path === '/api/reservations' && !init) return json([])
      if (path === '/api/reservations' && init?.method === 'POST') throw new Error('响应未到达')
      throw new Error(`Unexpected request: ${path}`)
    }))

    render(<App />)
    const form = await screen.findByRole('form', { name: '创建预约' })
    await fillReservationForm(user, form)
    await user.click(within(form).getByRole('button', { name: '提交预约' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('先刷新预约记录')

    await user.click(screen.getByRole('link', { name: '预约记录' }))
    await user.click(screen.getByRole('link', { name: '场地概览' }))
    await user.click(await screen.findByRole('link', { name: '预约羽毛球馆 A' }))

    const reopened = await screen.findByRole('form', { name: '创建预约' })
    expect(within(reopened).getByLabelText('预约人或组织')).toHaveValue('软件技术小组')
    expect(within(reopened).getByLabelText('预约日期')).toHaveValue('2030-10-30')
    expect(within(reopened).getByLabelText('使用目的')).toHaveValue('小组活动')
  })

  it('刷新场地期间暂停旧场地表单，返回停用状态后不可预约', async () => {
    const user = userEvent.setup()
    let resolveRefresh!: (response: Response) => void
    const refresh = new Promise<Response>((resolve) => { resolveRefresh = resolve })
    let venueAttempts = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input)
      if (path === '/api/venues') {
        venueAttempts += 1
        return venueAttempts === 1 ? json([venue]) : refresh
      }
      if (path === '/api/reservations') return json([])
      throw new Error(`Unexpected request: ${path}`)
    }))

    render(<App />)
    const form = await screen.findByRole('form', { name: '创建预约' })
    await user.type(within(form).getByLabelText('预约人或组织'), '待确认的草稿')
    await user.click(screen.getByRole('button', { name: '刷新场地列表' }))
    expect(screen.getByRole('form', { name: '创建预约' })).toBeInTheDocument()
    expect(within(form).getByLabelText('预约人或组织')).toHaveValue('待确认的草稿')
    expect(within(form).getByRole('button', { name: '提交预约' })).toBeDisabled()
    expect(screen.getByText('正在更新场地信息…')).toBeInTheDocument()

    await act(async () => { resolveRefresh(json([{ ...venue, status: 'CLOSED' }])); await refresh })
    expect(screen.getByText('该场地已停用，无法预约。')).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: '创建预约' })).not.toBeInTheDocument()
  })

  it('刷新后场地仍开放时保留表单草稿并恢复提交', async () => {
    const user = userEvent.setup()
    let resolveRefresh!: (response: Response) => void
    const refresh = new Promise<Response>((resolve) => { resolveRefresh = resolve })
    let venueAttempts = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input)
      if (path === '/api/venues') {
        venueAttempts += 1
        return venueAttempts === 1 ? json([venue]) : refresh
      }
      if (path === '/api/reservations') return json([])
      throw new Error(`Unexpected request: ${path}`)
    }))

    render(<App />)
    const form = await screen.findByRole('form', { name: '创建预约' })
    await user.type(within(form).getByLabelText('使用目的'), '保留的草稿')
    await user.click(screen.getByRole('button', { name: '刷新场地列表' }))
    expect(within(form).getByRole('button', { name: '提交预约' })).toBeDisabled()

    await act(async () => { resolveRefresh(json([venue])); await refresh })
    expect(within(form).getByLabelText('使用目的')).toHaveValue('保留的草稿')
    expect(within(form).getByRole('button', { name: '提交预约' })).toBeEnabled()
  })

  it('取消请求未完成时不会重复发送 POST', async () => {
    window.history.replaceState(null, '', '/#/reservations')
    let resolveCancellation!: (response: Response) => void
    const cancellation = new Promise<Response>((resolve) => { resolveCancellation = resolve })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path === '/api/venues') return json([venue])
      if (path === '/api/reservations') return json([reservation])
      if (path === '/api/reservations/12/cancel' && init?.method === 'POST') return cancellation
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    const cancelButton = await screen.findByRole('button', { name: '取消预约 12' })
    act(() => { fireEvent.click(cancelButton); fireEvent.click(cancelButton) })
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/reservations/12/cancel')).toHaveLength(1)
    await act(async () => {
      resolveCancellation(json({ ...reservation, status: 'CANCELLED', cancelled_at: '2030-10-01T11:00:00+08:00' }))
      await cancellation
    })
    expect(await screen.findByText('已取消')).toBeInTheDocument()
  })

  it('创建接口返回无效成功响应时提示核对记录，不伪造成功', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path === '/api/venues') return json([venue])
      if (path === '/api/reservations' && !init) return json([])
      if (path === '/api/reservations' && init?.method === 'POST') return json({ id: 12 }, 201)
      throw new Error(`Unexpected request: ${path}`)
    }))

    render(<App />)
    const form = await screen.findByRole('form', { name: '创建预约' })
    await fillReservationForm(user, form)
    await user.click(within(form).getByRole('button', { name: '提交预约' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('先刷新预约记录')
    expect(screen.queryByText(/预约成功，编号/)).not.toBeInTheDocument()
    expect(within(form).getByLabelText('预约人或组织')).toHaveValue('软件技术小组')
  })

  it('取消请求断网时保留原状态，刷新后采用服务器状态', async () => {
    window.history.replaceState(null, '', '/#/reservations')
    const user = userEvent.setup()
    let listAttempts = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path === '/api/venues') return json([venue])
      if (path === '/api/reservations') {
        listAttempts += 1
        return json(listAttempts === 1 ? [reservation] : [{ ...reservation, status: 'CANCELLED', cancelled_at: '2030-10-01T11:00:00+08:00' }])
      }
      if (path === '/api/reservations/12/cancel' && init?.method === 'POST') throw new Error('网络中断')
      throw new Error(`Unexpected request: ${path}`)
    }))

    render(<App />)
    await user.click(await screen.findByRole('button', { name: '取消预约 12' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('先刷新预约记录')
    expect(screen.getByText('有效')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '刷新预约记录' }))
    expect(await screen.findByText('已取消')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
