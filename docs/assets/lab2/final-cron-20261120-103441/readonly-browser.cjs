const fs=require('fs'),path=require('path');
const {chromium,expect}=require(path.join(process.cwd(),'frontend/node_modules/@playwright/test'));
(async()=>{
 const out=fs.readFileSync('/tmp/lab2-final-cron-evidence-path','utf8').trim(), m=JSON.parse(fs.readFileSync(path.join(out,'execution.json'),'utf8'));
 const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1100}});const checks=[];
 try{
 for(let i=0;i<m.scheduled_jobs.length;i++){
  const id=m.scheduled_jobs[i]; await page.goto(m.base_url+'/#/reports');await page.getByRole('textbox',{name:'Job ID'}).fill(id);
  const [res]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/reports/'+id)),page.getByRole('button',{name:'查询报告',exact:true}).click()]);
  expect(res.status()).toBe(200);const data=await res.json();expect(data.source).toBe('SCHEDULED');expect(data.status).toBe('SUCCEEDED');
  await expect(page.getByText('自动任务',{exact:true})).toBeVisible();await expect(page.getByText('2026-11-20 至 2026-11-20',{exact:true})).toBeVisible();
  await expect(page.locator('.report-table tbody tr')).toHaveCount(5);
  for(const item of data.items){const row=page.locator('.report-table tbody tr').filter({hasText:item.venue_name});await expect(row.locator('td')).toHaveText([String(item.reservation_count),String(item.reserved_minutes)]);}
  await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(out,'final-scheduled-report-'+(i+1)+'.png'),fullPage:true});
  checks.push({job_id:id,status:'PASS',source:data.source,date:data.start_date,rows:data.items.length,screenshot:'final-scheduled-report-'+(i+1)+'.png'});
 }
 fs.writeFileSync(path.join(out,'readonly-browser-checks.json'),JSON.stringify({status:'SUCCESS',scope:'Read-only report query; no seed or booking mutations',checks},null,2)+'\n');console.log(JSON.stringify(checks));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
