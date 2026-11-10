export async function renderRaidLogs(root,{event,organizer,roster}) {
  let revision=0;
  const fmt = value=>value == null ? '—' : Math.round(value).toLocaleString();
  const clock = seconds=>Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');
  const style = raidElement('style');
  style.textContent = '.log-hero{padding:26px;background:radial-gradient(ellipse at top right,#b67c3822,transparent 65%),var(--panel);border:1px solid var(--line);border-radius:13px;margin-bottom:18px}.log-hero h3{font-size:26px;margin:5px 0 10px}.log-controls{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin:18px 0}.log-controls label{flex:1;min-width:180px}.log-controls input,.log-controls select{display:block;width:100%;margin-top:6px}.log-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;margin-top:18px}.log-panel{padding:22px;border:1px solid var(--line);border-radius:13px;background:var(--panel);min-width:0}.log-panel h4{font-size:17px;margin:0 0 16px}.log-bar-row{display:grid;grid-template-columns:minmax(110px,1fr) 2fr auto;gap:12px;align-items:center;padding:9px 0;font-size:12px}.log-bar-track{height:8px;background:var(--raised);border-radius:6px;overflow:hidden}.log-bar-fill{height:100%;background:linear-gradient(90deg,#96643f,#e6bc75);border-radius:6px}.log-player-table{width:100%;font-size:12px}.log-player-table td,.log-player-table th{padding:10px;white-space:nowrap}.log-muted{color:var(--muted);font-size:12px}.log-timeline{max-height:320px;overflow:auto}.log-timeline p{display:flex;gap:16px;padding:10px 0;border-bottom:1px solid var(--line)}.log-timeline time{color:#e6bc75;font-variant-numeric:tabular-nums}.log-outcome{color:#91bd97}.log-outcome.wipe{color:#d89887}';
  root.append(style);
  const hero=raidElement('section',null,'log-hero');
  hero.append(raidElement('p','After The Pull','eyebrow'),raidElement('h3','Raid Logs'),raidElement('p','Review '+event.title+' through its pulls, performance, and execution.'));
  const attribution=raidElement('a','Combat data from Warcraft Logs'); attribution.href='https://forever.warcraftlogs.com/'; attribution.target='_blank'; attribution.rel='noopener noreferrer';hero.append(attribution);
  root.append(hero);
  if(organizer){
    const form=raidElement('form',null,'log-controls');
    const label=raidElement('label','Public Warcraft Logs Report');
    const input=raidElement('input'); input.required=true;input.maxLength=250;input.placeholder='Paste report URL or code';label.append(input);
    const save=raidElement('button','Link Report','raid-primary');save.type='submit';form.append(label,save);hero.append(form);
    form.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;try{await raidRequest('/'+event.id,{action:'logs-link',report:input.value});await load();}catch(e){message.textContent=e.message;}finally{save.disabled=false;}});
  }
  const message=raidElement('p','Loading report…','log-muted');message.setAttribute('role','status');root.append(message);
  const body=raidElement('div');root.append(body);
  async function load(){
    const current=++revision;body.replaceChildren();message.textContent='Loading report…';
    try{
      const data=await raidRequest('/'+event.id+'?logs=1');if(current!==revision||!root.isConnected)return;
      if(!data.report){message.textContent=organizer?'Link a public report above to begin analyzing this raid.':'The raid organizer has not linked a report yet.';return;}
      if(!data.configured){message.textContent='Report linked. Warcraft Logs API credentials still need to be configured on the server before analytics can load.';return;}
      message.textContent='Updated '+new Date(data.fetchedAt).toLocaleString()+' · Public report · Cached for 10 minutes';
      const report=data.report;
      const heading=raidElement('h3',report.title);const link=raidElement('a','Open Original Report ↗');
      link.href='https://forever.warcraftlogs.com/reports/'+report.code;link.target='_blank';link.rel='noopener noreferrer';
      body.append(heading,link);
      const fights=report.fights.filter(f=>!f.inProgress);
      const stats=raidElement('div',null,'raid-stats');
      raidStats(stats,[['Boss Pulls',fights.length],['Kills',fights.filter(f=>f.kill===true).length],['Wipes',fights.filter(f=>f.kill===false).length],['Time In Combat',clock(fights.reduce((s,f)=>s+(f.endTime-f.startTime)/1000,0))]]);body.append(stats);
      if(!fights.length){body.append(raidElement('p','No completed boss encounters are available in this report.'));return;}
      const progression=raidElement('section',null,'log-panel');progression.append(raidElement('h4','Pull History'),raidElement('p','Fight length by pull. Select a pull below for its performance and death review.','log-muted'));
      const max=Math.max(...fights.map(f=>f.endTime-f.startTime),1);
      fights.forEach((f,i)=>{const row=raidElement('div',null,'log-bar-row');const name=raidElement('span',String(i+1)+'. '+f.name);const track=raidElement('div',null,'log-bar-track');const fill=raidElement('div',null,'log-bar-fill');fill.style.width=(100*(f.endTime-f.startTime)/max)+'%';track.append(fill);const result=raidElement('span',(f.kill===true?'Kill':f.kill===false?'Wipe':'Unknown')+' · '+clock((f.endTime-f.startTime)/1000),'log-outcome'+(f.kill===false?' wipe':''));row.append(name,track,result);progression.append(row);});body.append(progression);
      const controls=raidElement('div',null,'log-controls');const label=raidElement('label','Inspect Pull');const select=raidElement('select');
      fights.forEach((f,i)=>{const option=raidElement('option',String(i+1)+'. '+f.name+' · '+(f.kill===true?'Kill':f.kill===false?'Wipe':'Unknown'));option.value=f.id;select.append(option);});label.append(select);controls.append(label);body.append(controls);
      const detail=raidElement('div');body.append(detail);let selection=0;
      async function inspect(){const ticket=++selection;detail.replaceChildren(raidElement('p','Analyzing pull…'));try{
        const result=await raidRequest('/'+event.id+'?logs=1&fight='+select.value);
        if(ticket!==selection||current!==revision||!root.isConnected)return;
        detail.replaceChildren();const a=result.analytics;
        const s=raidElement('div',null,'raid-stats');raidStats(s,[['Raid DPS',a.tables.damage&&a.seconds?a.totals.damage/a.seconds:null],['Raid HPS',a.tables.healing&&a.seconds?a.totals.healing/a.seconds:null],['Player Deaths',a.deathsComplete?a.deaths.length:a.deaths.length+'+'],['Interrupts',a.tables.interrupts?fmt(a.totals.interrupts):'—']].map(([k,v])=>[k,typeof v==='number'?fmt(v):v??'—']));detail.append(s);
        const tools=raidElement('div',null,'log-controls');const metricLabel=raidElement('label','Compare Players By');const metric=raidElement('select');
        [['dps','Damage Per Second'],['hps','Healing Per Second'],['dtps','Damage Taken Per Second'],['interrupts','Interrupts'],['dispels','Dispels']].forEach(([value,name])=>{const o=raidElement('option',name);o.value=value;metric.append(o);});metricLabel.append(metric);tools.append(metricLabel);detail.append(tools);
        const grid=raidElement('div',null,'log-grid');const ranks=raidElement('section',null,'log-panel');const deaths=raidElement('section',null,'log-panel');grid.append(ranks,deaths);detail.append(grid);
        function ranking(){ranks.replaceChildren(raidElement('h4',metric.selectedOptions[0].textContent));const key={dps:'damage',hps:'healing',dtps:'taken'}[metric.value]||metric.value;
          if(!a.tables[key]){ranks.append(raidElement('p','This metric was not returned by Warcraft Logs.'));return;}
          const players=[...a.players].sort((x,y)=>(y[metric.value]??0)-(x[metric.value]??0));const max=Math.max(...players.map(p=>p[metric.value]??0),1);
          players.forEach(p=>{const row=raidElement('div',null,'log-bar-row');const track=raidElement('div',null,'log-bar-track');const bar=raidElement('div',null,'log-bar-fill');bar.style.width=(100*(p[metric.value]??0)/max)+'%';track.append(bar);row.append(raidElement('span',p.name),track,raidElement('strong',fmt(p[metric.value])));ranks.append(row);});
        }metric.addEventListener('change',ranking);ranking();
        deaths.append(raidElement('h4','Death Timeline'));const timeline=raidElement('div',null,'log-timeline');a.deaths.forEach((d,i)=>{const line=raidElement('p');line.append(raidElement('time',clock(d.time)),raidElement('span',(i===0?'First Death · ':'')+d.name));timeline.append(line);});if(!a.deaths.length)timeline.append(raidElement('p','No player deaths recorded.'));deaths.append(timeline);if(!a.deathsComplete)deaths.append(raidElement('p','Partial timeline: Warcraft Logs returned more death events than this view can display.','log-muted'));
        const panel=raidElement('section',null,'log-panel');panel.append(raidElement('h4','Player Performance'));const scroll=raidElement('div',null,'scroll');const table=raidElement('table',null,'log-player-table');const head=raidElement('thead');const tr=raidElement('tr');['Player','DPS','HPS','DTPS','Interrupts','Dispels','Deaths'].forEach(h=>tr.append(raidElement('th',h)));head.append(tr);table.append(head);const rows=raidElement('tbody');a.players.forEach(p=>{const row=raidElement('tr');const match=roster.find(r=>r.character.toLowerCase()===p.name.toLowerCase());const name=raidElement('td',p.name);if(match){name.title=match.class_name+' · '+match.role;}row.append(name);['dps','hps','dtps','interrupts','dispels','deaths'].forEach(k=>{const key={dps:'damage',hps:'healing',dtps:'taken'}[k]||k;row.append(raidElement('td',k==='deaths'?(a.deathsComplete?fmt(p[k]):'—'):a.tables[key]?fmt(p[k]):'—'));});rows.append(row);});table.append(rows);scroll.append(table);panel.append(scroll,raidElement('p','Rates use the full pull duration. Damage taken depends on role and assignments; it is not an avoidable-damage score. Pets are not listed separately. No percentile rankings are inferred.','log-muted'));detail.append(panel);
      }catch(e){if(ticket===selection)detail.replaceChildren(raidElement('p',e.message));}}
      select.addEventListener('change',inspect);await inspect();
    }catch(e){if(current===revision)message.textContent=e.message;}
  }
  await load();
}
