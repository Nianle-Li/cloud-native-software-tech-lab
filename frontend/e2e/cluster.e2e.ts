import { expect, test } from '@playwright/test'

function futureShanghaiDate(daysAhead: number): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  const today = `${values.year}-${values.month}-${values.day}`
  return new Date(Date.parse(`${today}T00:00:00Z`) + daysAhead * 86_400_000).toISOString().slice(0, 10)
}

test('集群前端完成场地、预约、冲突、详情与取消', async ({ page }) => {
  const batch = `lab2-a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const venueName = `回归场地 ${batch}`
  const date = futureShanghaiDate(2)

  await page.goto('/#/')
  await page.getByRole('link', { name: '创建场地' }).last().click()
  const create = page.getByRole('dialog', { name: '创建场地' })
  await create.getByLabel('场地名称').fill(venueName)
  await create.getByLabel('所在位置').fill(`回归批次 ${batch}`)
  await create.getByLabel('可容纳人数').fill('10')
  await create.getByLabel('开放时间').fill('08:00')
  await create.getByLabel('关闭时间').fill('22:00')
  const [venueResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/venues') && response.request().method() === 'POST'),
    create.getByRole('button', { name: '创建场地', exact: true }).click(),
  ])
  expect(venueResponse.status()).toBe(201)
  const venue = await venueResponse.json() as { id: number }
  expect(venue.id).toBeGreaterThan(0)
  await expect(create.getByRole('status')).toContainText(`编号 ${venue.id}`)

  await page.goto(`/#/venues/${venue.id}`)
  await expect(page.getByRole('dialog', { name: '场地详情' })).toContainText(venueName)
  await page.goto(`/#/venues/${venue.id}/book`)
  const booking = page.getByRole('form', { name: '创建预约' })
  await expect(booking).toBeVisible()

  async function fillBooking() {
    await booking.getByLabel('预约人或组织').fill(batch)
    await booking.getByLabel('预约日期').fill(date)
    await booking.getByLabel('开始时间').fill('10:00')
    await booking.getByLabel('结束时间').fill('11:00')
    await booking.getByLabel('参与人数').fill('3')
    await booking.getByLabel('使用目的').fill(`浏览器回归 ${batch}`)
  }

  await fillBooking()
  const [reservationResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/reservations') && response.request().method() === 'POST'),
    booking.getByRole('button', { name: '提交预约' }).click(),
  ])
  expect(reservationResponse.status()).toBe(201)
  const reservation = await reservationResponse.json() as { id: number }
  expect(reservation.id).toBeGreaterThan(0)
  console.log(`batch=${batch} venue_id=${venue.id} reservation_id=${reservation.id} reservation_date=${date}`)
  await expect(page.getByRole('status')).toContainText(`预约成功，编号 ${reservation.id}`)

  await fillBooking()
  const [conflictResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/reservations') && response.request().method() === 'POST'),
    booking.getByRole('button', { name: '提交预约' }).click(),
  ])
  expect(conflictResponse.status()).toBe(409)
  await expect(page.getByRole('alert')).toContainText('已被预约')

  await page.goto(`/#/reservations/${reservation.id}`)
  await expect(page.getByRole('dialog', { name: '预约详情' })).toContainText(venueName)
  await page.goto('/#/reservations')
  const cancel = page.getByRole('button', { name: `取消预约 ${reservation.id}`, exact: true })
  await expect(cancel).toBeVisible()
  await cancel.click()
  const [cancelResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith(`/api/reservations/${reservation.id}/cancel`) && response.request().method() === 'POST'),
    page.getByRole('button', { name: `确认取消预约 ${reservation.id}` }).click(),
  ])
  expect(cancelResponse.status()).toBe(200)
  await expect(page.getByRole('status')).toContainText(`预约 ${reservation.id} 已取消`)
})

test('集群前端查询已持久化的成功报告、零值与非零值场地', async ({ page }) => {
  const jobId = process.env.LAB2_REPORT_JOB_ID
  expect(jobId, '请设置 LAB2_REPORT_JOB_ID 为目标集群中已成功的 Job 名称').toMatch(/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/)
  await page.goto('/#/reports')
  await page.getByRole('textbox', { name: 'Job ID' }).fill(jobId!)
  const [response] = await Promise.all([
    page.waitForResponse((item) => item.url().endsWith(`/api/reports/${jobId}`)),
    page.getByRole('button', { name: '查询报告' }).click(),
  ])
  expect(response.status()).toBe(200)
  const report = await response.json() as {
    job_id: string
    status: string
    items: Array<{ venue_id: number; reservation_count: number; reserved_minutes: number }>
  }
  expect(report.job_id).toBe(jobId)
  expect(report.status).toBe('SUCCEEDED')
  const zero = report.items.find((item) => item.reservation_count === 0 && item.reserved_minutes === 0)
  const positive = report.items.find((item) => item.reservation_count > 0 && item.reserved_minutes > 0)
  expect(zero, '报告应包含零值场地').toBeDefined()
  expect(positive, '报告应包含非零值场地').toBeDefined()
  await expect(page.getByRole('heading', { name: '报告结果' })).toBeVisible()
  await expect(page.getByText('已成功', { exact: true })).toBeVisible()
  await expect(page.locator('.report-table tbody tr')).toHaveCount(report.items.length)
  const zeroRow = page.locator('.report-table tbody tr').filter({ hasText: `（#${zero!.venue_id}）` })
  await expect(zeroRow.locator('td')).toHaveText(['0', '0'])
  const positiveRow = page.locator('.report-table tbody tr').filter({ hasText: `（#${positive!.venue_id}）` })
  await expect(positiveRow.locator('td')).toHaveText([
    String(positive!.reservation_count), String(positive!.reserved_minutes),
  ])
  console.log(`job_id=${jobId} status=${report.status} zero_venue_id=${zero!.venue_id} positive_venue_id=${positive!.venue_id}`)
})
