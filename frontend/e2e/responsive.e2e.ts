import { expect, test } from '@playwright/test'

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
  id: 1,
  venue_id: 1,
  booked_by: '软件技术小组',
  reservation_date: '2031-01-02',
  start_time: '10:00',
  end_time: '11:00',
  attendee_count: 3,
  purpose: '课程开发会议',
  status: 'ACTIVE',
  created_at: '2030-12-01T10:00:00+08:00',
  cancelled_at: null,
}

const routes = [
  { hash: '#/', ready: '.venue-list' },
  { hash: '#/venues/new', ready: '.venue-create-panel' },
  { hash: '#/venues/1', ready: '.detail-list' },
  { hash: '#/venues/1/book', ready: '.booking-form' },
  { hash: '#/reservations', ready: '.reservation-list' },
  { hash: '#/reservations/1', ready: '.detail-list' },
]

test('六个地址在窄屏、桌面和放大文字时保持内容可见', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('**/api/venues', (route) => route.fulfill({ json: [venue] }))
  await page.route('**/api/venues/1', (route) => route.fulfill({ json: venue }))
  await page.route('**/api/reservations', (route) => route.fulfill({ json: [reservation] }))
  await page.route('**/api/reservations/1', (route) => route.fulfill({ json: reservation }))

  for (const { hash, ready } of routes) {
    for (const width of [280, 320, 375, 800, 1366, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/${hash}`)
      await page.locator(ready).waitFor()
      await page.evaluate(() => document.fonts.ready)

      for (const fontSize of [16, 24, 32]) {
        const result = await page.evaluate((size) => {
          document.documentElement.style.fontSize = `${size}px`
          const viewport = window.innerWidth
          const visibleContent = document.querySelectorAll(
            '.site-header, .hero-copy, .hero-stats, .hero-stats span, .panel, .venue-card, .booking-layout, .form-grid input, .form-grid textarea, .detail-list dd, .overlay-panel, .overlay-heading, .overlay-close',
          )
          const outside = [...visibleContent].filter((element) => {
            const box = element.getBoundingClientRect()
            return box.width > 0 && (box.left < -1 || box.right > viewport + 1)
          }).map((element) => element.className || element.tagName)
          const clippedStats = [...document.querySelectorAll('.hero-stats span')]
            .filter((element) => element.scrollWidth > element.clientWidth + 1)
            .map((element) => element.textContent?.trim())
          return { documentWidth: document.documentElement.scrollWidth, outside, clippedStats }
        }, fontSize)

        expect(result.documentWidth, `${hash}, ${width}px, 根字体 ${fontSize}px`).toBeLessThanOrEqual(width + 1)
        expect(result.outside, `${hash}, ${width}px, 根字体 ${fontSize}px`).toEqual([])
        expect(result.clippedStats, `${hash}, ${width}px, 根字体 ${fontSize}px`).toEqual([])
      }
    }
  }
  expect(pageErrors).toEqual([])
})

test('移动端标题、统计和操作控件保持清晰', async ({ page }) => {
  await page.route('**/api/venues', (route) => route.fulfill({ json: [venue] }))
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto('/#/')
  await page.locator('.venue-list').waitFor()
  await page.evaluate(() => document.fonts.ready)

  const headline = await page.evaluate(() => {
    document.documentElement.style.fontSize = '24px'
    const title = document.querySelector<HTMLElement>('.hero h1')!
    const lines = title.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(title).lineHeight)
    const wrappedStats = [...document.querySelectorAll('.hero-stats span')].filter((element) =>
      element.getBoundingClientRect().height > Number.parseFloat(getComputedStyle(element).lineHeight) + 1,
    )
    return { lines, wrappedStats: wrappedStats.length }
  })
  expect(headline.lines).toBeLessThanOrEqual(2.2)
  expect(headline.wrappedStats).toBe(0)

  await page.evaluate(() => { document.documentElement.style.fontSize = '16px' })
  const smallControls = await page.evaluate(() => [...document.querySelectorAll(
    'button.secondary, .filter-button, .create-venue-link, .detail-book-link, .site-nav a',
  )].filter((element) => element.getBoundingClientRect().height < 43.5).map((element) => element.textContent?.trim()))
  expect(smallControls).toEqual([])

  await page.goto('/#/venues/new')
  await page.locator('.venue-create-panel').waitFor()
  const smallInputs = await page.evaluate(() => [...document.querySelectorAll('.form-grid input, .form-grid select')]
    .filter((element) => Number.parseFloat(getComputedStyle(element).fontSize) < 16)
    .map((element) => element.tagName))
  expect(smallInputs).toEqual([])

  const dialog = page.getByRole('dialog', { name: '创建场地' })
  expect(await dialog.boundingBox()).toMatchObject({ x: 0, width: 375 })
  expect(await dialog.getByRole('heading', { name: '创建场地' }).isVisible()).toBe(true)
})

test('桌面弹窗和侧栏比例协调，关闭后回到原列表', async ({ page }) => {
  await page.route('**/api/venues', (route) => route.fulfill({ json: [venue] }))
  await page.route('**/api/venues/1', (route) => route.fulfill({ json: venue }))
  await page.route('**/api/reservations', (route) => route.fulfill({ json: [reservation] }))
  await page.route('**/api/reservations/1', (route) => route.fulfill({ json: reservation }))
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/#/')
  await page.getByRole('link', { name: '查看羽毛球馆 A详情' }).click()
  const detail = page.getByRole('dialog', { name: '场地详情' })
  const detailBox = await detail.boundingBox()
  expect(detailBox!.width).toBeGreaterThan(440)
  expect(detailBox!.width).toBeLessThan(600)
  expect(detailBox!.x + detailBox!.width).toBe(1366)
  await detail.getByRole('button', { name: '关闭场地详情' }).click()
  expect(new URL(page.url()).hash).toBe('#/')
  await page.getByRole('link', { name: '查看羽毛球馆 A详情' }).click()
  await page.goBack()
  await expect(page.getByRole('dialog', { name: '场地详情' })).toHaveCount(0)
  expect(new URL(page.url()).hash).toBe('#/')
  await page.getByRole('link', { name: '创建场地' }).last().click()
  const create = page.getByRole('dialog', { name: '创建场地' })
  const createBox = await create.boundingBox()
  expect(createBox!.width).toBeGreaterThan(650)
  expect(createBox!.width).toBeLessThan(800)
  expect(Math.abs(createBox!.x - (1366 - createBox!.width) / 2)).toBeLessThan(2)
  await create.getByLabel('场地名称').fill('草稿保留测试')
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: '创建场地' }).last().click()
  await expect(page.getByRole('dialog', { name: '创建场地' }).getByLabel('场地名称')).toHaveValue('草稿保留测试')
})

test('预约记录在桌面使用整行条目，时间、资料和操作区清晰分开', async ({ page }) => {
  const records = [reservation, { ...reservation, id: 2, status: 'CANCELLED', cancelled_at: '2030-12-02T10:00:00+08:00' }]
  await page.route('**/api/venues', (route) => route.fulfill({ json: [venue] }))
  await page.route('**/api/reservations', (route) => route.fulfill({ json: records }))
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/#/reservations')
  const list = page.locator('.reservation-list')
  const cards = list.locator('.reservation-card')
  await expect(cards).toHaveCount(2)
  const listBox = await list.boundingBox()
  const firstBox = await cards.nth(0).boundingBox()
  const secondBox = await cards.nth(1).boundingBox()
  expect(firstBox!.width).toBeGreaterThan(listBox!.width * 0.95)
  expect(firstBox!.height).toBeLessThan(190)
  expect(secondBox!.y).toBeGreaterThan(firstBox!.y + firstBox!.height - 1)
  await expect(cards.nth(0).getByText('2031-01-02')).toBeVisible()
  await expect(cards.nth(0).getByRole('link', { name: '查看预约 #1 详情' })).toBeVisible()
  await expect(cards.nth(0).getByRole('button', { name: '取消预约 1' })).toBeVisible()
  await expect(cards.nth(1).getByRole('button', { name: '取消预约 2' })).toHaveCount(0)
})

test('创建场地、预约、查看详情与取消的真实点击路径完整', async ({ page }) => {
  const venues = [venue]
  const records: Array<Record<string, unknown>> = []
  await page.route('**/api/venues', async (route) => {
    if (route.request().method() === 'POST') {
      const created = { id: 2, ...route.request().postDataJSON() }
      venues.push(created)
      await route.fulfill({ status: 201, json: created })
    } else await route.fulfill({ json: venues })
  })
  await page.route('**/api/venues/2', (route) => route.fulfill({ json: venues[1] }))
  await page.route('**/api/reservations', async (route) => {
    if (route.request().method() === 'POST') {
      const created = { ...reservation, id: 3, ...route.request().postDataJSON() }
      records.push(created)
      await route.fulfill({ status: 201, json: created })
    } else await route.fulfill({ json: records })
  })
  await page.route('**/api/reservations/3', (route) => route.fulfill({ json: records[0] }))
  await page.route('**/api/reservations/3/cancel', async (route) => {
    records[0] = { ...records[0], status: 'CANCELLED', cancelled_at: '2030-12-01T11:00:00+08:00' }
    await route.fulfill({ json: records[0] })
  })

  await page.goto('/#/')
  await page.getByRole('link', { name: '创建场地' }).last().click()
  const create = page.getByRole('dialog', { name: '创建场地' })
  await create.getByLabel('场地名称').fill('排练室')
  await create.getByLabel('所在位置').fill('教学楼 3 层')
  await create.getByLabel('可容纳人数').fill('20')
  await create.getByLabel('开放时间').fill('09:00')
  await create.getByLabel('关闭时间').fill('21:00')
  await create.getByRole('button', { name: '创建场地', exact: true }).click()
  await expect(create.getByRole('status')).toContainText('场地创建成功，编号 2')
  await create.getByRole('link', { name: '预约排练室' }).click()

  const booking = page.getByRole('form', { name: '创建预约' })
  await expect(booking).toBeVisible()
  await booking.getByLabel('预约人或组织').fill('软件技术小组')
  await booking.getByLabel('预约日期').fill('2031-01-02')
  await booking.getByLabel('开始时间').fill('10:00')
  await booking.getByLabel('结束时间').fill('11:00')
  await booking.getByLabel('参与人数').fill('3')
  await booking.getByLabel('使用目的').fill('课程开发会议')
  await booking.getByRole('button', { name: '提交预约' }).click()
  await expect(page.getByRole('status')).toContainText('预约成功，编号 3')
  await page.getByRole('link', { name: '查看预约记录' }).click()
  await page.getByRole('link', { name: '查看预约 #3 详情' }).click()
  const detail = page.getByRole('dialog', { name: '预约详情' })
  await expect(detail.getByText('排练室（编号 2）')).toBeVisible()
  await detail.getByRole('button', { name: '关闭预约详情' }).click()
  await page.getByRole('button', { name: '取消预约 3', exact: true }).click()
  await page.getByRole('button', { name: '确认取消预约 3' }).click()
  await expect(page.getByRole('status')).toContainText('预约 3 已取消')
})

test('冲突由服务端拒绝，取消后同一时段可以重新预约', async ({ page }) => {
  const records: Array<Record<string, unknown>> = []
  let postAttempts = 0
  await page.route('**/api/venues', (route) => route.fulfill({ json: [venue] }))
  await page.route('**/api/reservations', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fulfill({ json: records })
      return
    }
    postAttempts += 1
    if (records.some((item) => item.status === 'ACTIVE')) {
      await route.fulfill({ status: 409, json: { error: { code: 'RESERVATION_CONFLICT', message: '该时间段已有预约' } } })
      return
    }
    const created = { ...reservation, ...route.request().postDataJSON(), id: records.length + 1 }
    records.unshift(created)
    await route.fulfill({ status: 201, json: created })
  })
  await page.route('**/api/reservations/1/cancel', async (route) => {
    records[0] = { ...records[0], status: 'CANCELLED', cancelled_at: '2030-12-01T11:00:00+08:00' }
    await route.fulfill({ json: records[0] })
  })

  async function fillBooking() {
    const form = page.getByRole('form', { name: '创建预约' })
    await form.getByLabel('预约人或组织').fill('软件技术小组')
    await form.getByLabel('预约日期').fill('2031-01-02')
    await form.getByLabel('开始时间').fill('10:00')
    await form.getByLabel('结束时间').fill('11:00')
    await form.getByLabel('参与人数').fill('3')
    await form.getByLabel('使用目的').fill('课程开发会议')
    await form.getByRole('button', { name: '提交预约' }).click()
  }

  await page.goto('/#/venues/1/book')
  await fillBooking()
  await expect(page.getByRole('status')).toContainText('预约成功，编号 1')
  await fillBooking()
  await expect(page.getByRole('alert')).toContainText('该时间段已有预约')
  expect(postAttempts).toBe(2)

  await page.getByRole('link', { name: '查看预约记录' }).click()
  await page.getByRole('button', { name: '取消预约 1', exact: true }).click()
  await page.getByRole('button', { name: '确认取消预约 1' }).click()
  await expect(page.getByRole('status')).toContainText('预约 1 已取消')
  await page.getByRole('link', { name: '← 返回场地概览', exact: true }).click()
  await page.getByRole('link', { name: '预约羽毛球馆 A' }).click()
  await fillBooking()
  await expect(page.getByRole('status')).toContainText('预约成功，编号 2')
  expect(postAttempts).toBe(3)
})

test('长场地和预约内容不会撑破页面', async ({ page }) => {
  const longVenue = { ...venue, name: `多功能教室${'超长场地名称'.repeat(13)}`, location: 'A'.repeat(180) }
  const longReservation = { ...reservation, booked_by: 'B'.repeat(100), purpose: 'C'.repeat(500) }
  await page.route('**/api/venues', (route) => route.fulfill({ json: [longVenue] }))
  await page.route('**/api/venues/1', (route) => route.fulfill({ json: longVenue }))
  await page.route('**/api/reservations', (route) => route.fulfill({ json: [longReservation] }))
  await page.route('**/api/reservations/1', (route) => route.fulfill({ json: longReservation }))

  for (const { hash, ready } of routes.filter(({ hash }) => hash !== '#/venues/new')) {
    for (const width of [320, 375, 800]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/${hash}`)
      await page.locator(ready).waitFor()
      const overflow = await page.evaluate(() => {
        document.documentElement.style.fontSize = '24px'
        const viewport = window.innerWidth
        const fields = [...document.querySelectorAll(
          'main h1, .venue-card h3, .venue-card-body p, .booking-venue-card dd, .reservation-card dd, .detail-list dd',
        )]
        return {
          page: document.documentElement.scrollWidth > viewport + 1,
          fields: fields.filter((element) => element.getBoundingClientRect().right > viewport + 1).length,
        }
      })
      expect(overflow, `${hash}, ${width}px, 长内容`).toEqual({ page: false, fields: 0 })
    }
  }
})

test('记录分页和取消确认在极窄屏放大文字时仍可操作', async ({ page }) => {
  const records = Array.from({ length: 8 }, (_, index) => ({
    ...reservation,
    id: index + 1,
    booked_by: `预约人 ${index + 1}`,
  }))
  await page.route('**/api/venues', (route) => route.fulfill({ json: [venue] }))
  await page.route('**/api/reservations', (route) => route.fulfill({ json: records }))
  await page.setViewportSize({ width: 280, height: 900 })
  await page.goto('/#/reservations')
  await page.locator('.pagination').waitFor()
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px' })

  const pagination = await page.evaluate(() => {
    const container = document.querySelector('.pagination')!.getBoundingClientRect()
    return [...document.querySelector('.pagination')!.children].map((element) => {
      const box = element.getBoundingClientRect()
      return { inside: box.left >= container.left - 1 && box.right <= container.right + 1, height: box.height }
    })
  })
  expect(pagination.every(({ inside, height }) => inside && height < 140)).toBe(true)

  await page.getByRole('button', { name: '取消预约 1', exact: true }).click()
  const confirmation = await page.evaluate(() => {
    const container = document.querySelector('.cancel-confirmation')!.getBoundingClientRect()
    return [...document.querySelectorAll('.cancel-confirmation button')].map((element) => {
      const box = element.getBoundingClientRect()
      return { inside: box.left >= container.left - 1 && box.right <= container.right + 1, height: box.height }
    })
  })
  expect(confirmation.every(({ inside, height }) => inside && height < 140)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(281)
})
