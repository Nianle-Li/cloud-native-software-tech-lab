import { useEffect, useRef, useState } from 'react'
import { reportApi, isReportJobId } from '../api/reports'
import type { Report } from '../api/reports'
import { ApiError } from '../api/client'
import { useCurrentMinute } from '../useCurrentMinute'

type QueryState =
  | { kind: 'idle' }
  | { kind: 'loading'; jobId: string }
  | { kind: 'success'; jobId: string; report: Report }
  | { kind: 'error'; jobId: string; message: string }

function queryError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404 && error.code === 'REPORT_NOT_FOUND') {
      return '数据库暂无运行记录；请核对 Job ID，并在 Kubernetes 中查看 Job 状态和日志。'
    }
    if (error.code === 'NETWORK_ERROR') return '网络异常，暂时无法查询报告，请检查连接后手动刷新。'
    if (error.code === 'INVALID_RESPONSE') return '报告接口返回无效数据，暂时无法确认报告状态。'
    return error.message
  }
  return '查询报告失败，请稍后手动刷新。'
}

export function ReportsPage() {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState<QueryState>({ kind: 'idle' })
  const requestVersion = useRef(0)
  const now = useCurrentMinute()

  useEffect(() => () => { requestVersion.current += 1 }, [])

  async function load(jobId: string) {
    const version = ++requestVersion.current
    setQuery({ kind: 'loading', jobId })
    try {
      const report = await reportApi.get(jobId)
      if (version === requestVersion.current) setQuery({ kind: 'success', jobId, report })
    } catch (error) {
      if (version === requestVersion.current) setQuery({ kind: 'error', jobId, message: queryError(error) })
    }
  }

  function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const jobId = input.trim()
    if (!isReportJobId(jobId)) {
      requestVersion.current += 1
      setQuery({ kind: 'error', jobId: '', message: 'Job ID 格式无效，请输入 1 至 63 位小写字母、数字或连字符。' })
      return
    }
    void load(jobId)
  }

  function edit(value: string) {
    requestVersion.current += 1
    setInput(value)
    setQuery({ kind: 'idle' })
  }

  const report = query.kind === 'success' ? query.report : null
  const isLongRunning = report?.status === 'RUNNING'
    && now.getTime() - Date.parse(report.started_at) > 40 * 60_000

  return (
    <>
      <div className="subpage-banner">
        <a className="back-link" href="#/">← 返回场地概览</a>
        <p className="eyebrow">持久化报告</p>
        <h1 tabIndex={-1}>查询报告</h1>
      </div>
      <section className="panel reports-panel" aria-labelledby="report-query-heading">
        <div className="section-heading">
          <div>
            <h2 id="report-query-heading">按 Job ID 查询</h2>
            <p>从手动任务命令或 Kubernetes Job 列表取得 ID。这里只读取数据库中已保存的报告。</p>
          </div>
        </div>
        <form className="report-query-form" onSubmit={submit} noValidate>
          <label htmlFor="report-job-id">Job ID</label>
          <div className="report-query-controls">
            <input id="report-job-id" value={input} onChange={(event) => edit(event.target.value)}
              autoCapitalize="off" autoComplete="off" spellCheck={false} maxLength={63}
              placeholder="例如 venue-report-20261115-001" />
            <button type="submit" disabled={query.kind === 'loading'}>查询报告</button>
            {query.kind !== 'idle' && query.jobId && (
              <button type="button" className="secondary" disabled={query.kind === 'loading'} onClick={() => void load(query.jobId)}>
                刷新报告
              </button>
            )}
          </div>
        </form>
        {query.kind === 'idle' && <p className="empty-state">输入 Job ID 后查询报告状态与场地明细。</p>}
        {query.kind === 'loading' && <p role="status" className="empty-state">正在查询报告…</p>}
        {query.kind === 'error' && <p role="alert" className="notice error">{query.message}</p>}
      </section>

      {report && (
        <section className="panel reports-result" aria-labelledby="report-result-heading">
          <div className="section-heading">
            <div>
              <p className="section-kicker">{report.job_id}</p>
              <h2 id="report-result-heading">报告结果</h2>
            </div>
          </div>
          <dl className="report-summary">
            <div><dt>来源</dt><dd>{report.source === 'MANUAL' ? '手动任务' : '自动任务'}</dd></div>
            <div><dt>范围</dt><dd>{report.start_date} 至 {report.end_date}</dd></div>
            <div><dt>状态</dt><dd>{report.status === 'RUNNING' ? '运行中' : report.status === 'SUCCEEDED' ? '已成功' : '已失败'}</dd></div>
            <div><dt>开始时间</dt><dd>{report.started_at}</dd></div>
            <div><dt>结束时间</dt><dd>{report.finished_at ?? '尚未结束'}</dd></div>
            <div><dt>生成时间</dt><dd>{report.generated_at ?? '尚未生成'}</dd></div>
          </dl>
          {report.status === 'RUNNING' && (
            <p className="empty-state">报告仍在运行，请稍后手动刷新。
              {isLongRunning && ' 已超过 40 分钟，请核对 Kubernetes Job 状态和日志；页面无法据此判断成功或失败。'}
            </p>
          )}
          {report.status === 'FAILED' && (
            <p role="alert" className="notice error">{report.error_summary}。Kubernetes Job 可能继续重试，请手动刷新或查看 Job 日志。</p>
          )}
          {report.status === 'SUCCEEDED' && (
            report.items.length === 0 ? <p className="empty-state">本次报告没有场地明细。</p> : (
              <div className="report-table-scroll">
                <table className="report-table">
                  <caption>各场地已预约次数与分钟数，包括零值场地</caption>
                  <thead><tr><th scope="col">场地</th><th scope="col">预约次数</th><th scope="col">已预约分钟数</th></tr></thead>
                  <tbody>{report.items.map((item) => (
                    <tr key={item.venue_id}>
                      <th scope="row">{item.venue_name}（#{item.venue_id}）</th>
                      <td>{item.reservation_count}</td><td>{item.reserved_minutes}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )
          )}
        </section>
      )}
    </>
  )
}
