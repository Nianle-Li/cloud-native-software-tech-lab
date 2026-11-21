import { expect, test } from '@playwright/test'

test('报告页在窄屏可查询零值场地且不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.route('**/api/reports/venue-report-20261115-001', async (route) => {
    await route.fulfill({ json: {
      job_id: 'venue-report-20261115-001', source: 'MANUAL',
      start_date: '2026-11-15', end_date: '2026-11-15', status: 'SUCCEEDED',
      started_at: '2026-11-15T10:00:00+08:00',
      finished_at: '2026-11-15T10:00:03+08:00',
      generated_at: '2026-11-15T10:00:03+08:00', error_summary: null,
      items: [{ venue_id: 2, venue_name: '零预约场地', reservation_count: 0, reserved_minutes: 0 }],
    } })
  })

  await page.goto('/#/reports')
  await page.getByRole('textbox', { name: 'Job ID' }).fill('venue-report-20261115-001')
  await page.getByRole('button', { name: '查询报告' }).click()

  await expect(page.getByRole('row', { name: /零预约场地/ })).toHaveText('零预约场地（#2）00')
  await expect(page.getByRole('button', { name: '刷新报告' })).toBeVisible()
  const viewport = await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }))
  expect(viewport.pageWidth).toBeLessThanOrEqual(viewport.viewportWidth)
})
