export function renderTonight(root,{event,organizer,roster,prep}) {
  const players = roster.filter(player=>player.status === 'Going');
  const setup = raidElement('section',null,'raid-card');
  setup.append(raidElement('p','Raid preparation','eyebrow'),raidElement('h3','Prepare for '+event.title),
    raidElement('p','Set attendance and time, then schedule the preparation tasks that fit.'));
  const controls = raidElement('div',null,'raid-actions');
  function field(parent,title,tag) {
    const label = raidElement('label',title);
    const control = raidElement(tag);
    label.append(control); parent.append(label);
    return control;
  }
  const start = field(controls,'Start time ','input');
  start.type = 'time'; start.value = '19:00';
  const duration = field(controls,'Time available ','select');
  for (const value of [30,60,90,120,150,180,240]) duration.add(new Option(value+' minutes',value));
  duration.value = '120';
  const generate = raidElement('button','Generate evening plan →','raid-primary');
  controls.append(generate); setup.append(controls); root.append(setup);

  const attendance = raidElement('details',null,'raid-card');
  const attendanceTitle = raidElement('summary');
  const choices = raidElement('div',null,'prep-attendance');
  const names = [...new Set(players.map(player=>player.character))].filter(name=>players.filter(player=>player.character===name).length===1);
  const availability = new Map(names.map(name=>{
    const label = raidElement('label');
    const check = raidElement('input');
    check.type = 'checkbox'; check.checked = true;
    label.append(check,' '+name); choices.append(label);
    return [name,check];
  }));
  const available = ()=>names.filter(name=>availability.get(name).checked);
  function updateAttendance() {
    attendanceTitle.textContent = available().length+' / '+players.length+' players available · Adjust attendance';
  }
  updateAttendance();
  attendance.append(attendanceTitle,choices); root.append(attendance);

  async function change(input,control) {
    control.disabled = true;
    try {
      await raidRequest('/'+event.id,input);
      if (root.isConnected) await openRaidView('tonight',null,false);
    } catch (error) { if (root.isConnected) raidError(error); }
    finally { control.disabled = false; }
  }
  const catalog = raidElement('details',null,'raid-card');
  catalog.append(raidElement('summary','Preparation tasks · '+prep.length));
  for (const task of prep) {
    const row = raidElement('div',null,'raid-row');
    row.append(raidElement('strong',task.title),raidElement('small',task.reportedAt ? 'Completion reported' :
      task.minutes+' min · '+task.players.join(', ')+(task.ready ? '' : ' · prerequisites unconfirmed')));
    if (organizer && !task.reportedAt) {
      const remove = raidElement('button','Remove');
      remove.addEventListener('click',()=>change({action:'prep-remove',id:task.id},remove));
      row.append(remove);
    }
    catalog.append(row);
  }
  if (organizer) {
    const form = raidElement('form',null,'raid-form prep-form');
    const title = field(form,'Task title','input'); title.required = true; title.maxLength = 100;
    const category = field(form,'Activity type','select');
    for (const type of prepCategories) category.add(new Option(type,type));
    category.value = prepCategories[1];
    const minutes = field(form,'Minutes including travel','input');
    Object.assign(minutes,{type:'number',min:5,max:240,value:30,required:true});
    const party = field(form,'Players (select multiple for group runs)','select');
    party.multiple = true; party.required = true; party.size = Math.min(6,Math.max(2,names.length));
    for (const name of names) party.add(new Option(name+' · '+players.find(player=>player.character===name).role,name));
    const benefit = field(form,'Raid benefit','input'); benefit.maxLength = 240;
    const target = field(form,'Character whose check could be resolved','select');
    target.add(new Option('No character check',''));
    for (const name of names) target.add(new Option(name,name));
    const check = field(form,'Check','select');
    check.add(new Option('Select a check',''));
    for (const [key,name] of readinessChecks) check.add(new Option(name,key));
    const after = field(form,'Depends on','select');
    after.add(new Option('No other task',''));
    for (const task of prep) after.add(new Option(task.title,task.id));
    const readyLabel = raidElement('label',null,'prep-check');
    const ready = raidElement('input'); ready.type = 'checkbox';
    readyLabel.append(ready,' Materials and prerequisites confirmed');
    const add = raidElement('button','Add preparation task','raid-primary');
    form.append(readyLabel,add); catalog.append(form);
    form.addEventListener('submit',e=>{
      e.preventDefault();
      change({action:'prep-add',title:title.value,category:category.value,minutes:minutes.value,
        players:[...party.selectedOptions].map(option=>option.value),benefit:benefit.value,
        target:target.value,check:check.value,after:after.value,ready:ready.checked},add);
    });
  }
  root.append(catalog);

  const output = raidElement('div');
  root.append(output);
  function reset() {
    const empty = raidElement('section',null,'raid-card workspace-empty');
    empty.append(raidElement('h3','Turn raid blockers into a plan'),raidElement('p',prep.length ?
      'Generate a plan to see the proposed assignments and each player’s schedule.' :
      'Add preparation tasks for this raid before generating an evening plan.'));
    output.replaceChildren(empty);
  }
  reset();
  choices.addEventListener('change',()=>{ updateAttendance(); reset(); });
  controls.addEventListener('change',reset);
  generate.addEventListener('click',()=>{
    if (!start.value) { start.focus(); return; }
    const total = Number(duration.value);
    const {assignments,remaining} = schedulePrep(prep,players,available(),total);
    const [hours,mins] = start.value.split(':').map(Number);
    const time = offset=>{
      const minute = (hours*60+mins+offset)%1440;
      return String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
    };
    const forecast = players.map(player=>{
      const readiness = {...player.readiness};
      for (const task of assignments) {
        if (task.target===player.character && task.check && readiness[task.check]==='Blocked') readiness[task.check]='Ready';
      }
      return {...player,readiness};
    });
    const score = (list,state)=>list.filter(player=>readinessOf(player)===state).length;
    const card = raidElement('section',null,'raid-card prep-results');
    card.append(raidElement('p','Proposed plan · '+time(0)+'–'+time(total),'eyebrow'),
      raidElement('h3','What this evening could change'),
      raidElement('p','Projections depend on successful work and an organizer review. Only explicitly selected checks count.'));
    const stats = raidElement('div',null,'raid-stats');
    raidStats(stats,[['Raiders with known blockers',score(players,'Blocked')+' → '+score(forecast,'Blocked')],
      ['Meet character requirements',score(players,'Ready')+' → '+score(forecast,'Ready')],['Scheduled assignments',assignments.length]]);
    card.append(stats);
    if (remaining.length) {
      const gaps = raidElement('details');
      gaps.append(raidElement('summary',remaining.length+' tasks still need attention'));
      for (const {task,reason} of remaining) gaps.append(raidElement('p',task.title+' · '+reason));
      card.append(gaps);
    }
    const playerView = raidElement('section',null,'prep-player');
    playerView.append(raidElement('h3','Each player’s evening'));
    const picker = field(playerView,'View player’s evening ','select');
    for (const name of available()) {
      const scheduled = assignments.filter(task=>task.players.includes(name)).reduce((sum,task)=>sum+task.minutes,0);
      picker.add(new Option(name+' · '+scheduled+' min planned · '+(total-scheduled)+' min free',name));
    }
    picker.disabled = !picker.options.length;
    const timeline = raidElement('div');
    playerView.append(timeline); card.append(playerView);
    function drawTimeline() {
      timeline.replaceChildren();
      if (!picker.value) { timeline.append(raidElement('p','No players available.')); return; }
      let cursor = 0;
      const bar = raidElement('div',null,'prep-timeline');
      bar.setAttribute('aria-hidden','true');
      const rows = raidElement('div');
      function slot(begin,end,title,kind) {
        const segment = raidElement('span',null,kind);
        segment.style.flexGrow = end-begin; bar.append(segment);
        const row = raidElement('div',null,'raid-row');
        row.append(raidElement('strong',title),raidElement('small',time(begin)+'–'+time(end)));
        rows.append(row);
      }
      for (const task of assignments.filter(task=>task.players.includes(picker.value))) {
        if (cursor < task.start) slot(cursor,task.start,'Unallocated time','prep-free');
        slot(task.start,task.end,task.title,task.category===prepCategories[0] ? 'prep-group' : 'prep-task');
        cursor = task.end;
      }
      if (cursor < total) slot(cursor,total,'Unallocated time','prep-free');
      timeline.append(bar,rows);
    }
    picker.addEventListener('change',drawTimeline); drawTimeline();

    const activities = raidElement('section',null,'raid-card prep-results');
    activities.append(raidElement('h3','The activities behind this plan'));
    for (const category of prepCategories) {
      const tasks = assignments.filter(task=>task.category===category);
      if (!tasks.length) continue;
      activities.append(raidElement('h4',category));
      for (const task of tasks) {
        const details = raidElement('details',null,'prep-activity');
        details.append(raidElement('summary',time(task.start)+'–'+time(task.end)+' · '+task.title),
          raidElement('p',task.players.join(', ')),raidElement('p',task.benefit || 'No benefit entered.'));
        activities.append(details);
      }
    }
    const free = available().filter(name=>!assignments.some(task=>task.players.includes(name)));
    if (free.length) {
      const details = raidElement('details',null,'prep-activity');
      details.append(raidElement('summary',free.length+' available players without an assignment'),raidElement('p',free.join(', ')));
      activities.append(details);
    }
    const handoff = raidElement('section',null,'raid-card prep-handoff');
    handoff.append(raidElement('h3','Get the plan to your players'));
    const preview = raidElement('details');
    const message = raidElement('textarea');
    message.readOnly = true; message.rows = 8; message.setAttribute('aria-label','Discord message preview');
    message.value = ['Solstice · '+event.title,'Preparation '+time(0)+'–'+time(total)+' (organizer’s local time)',...assignments.map(task=>
      time(task.start)+'–'+time(task.end)+' · '+task.title+' · '+task.players.join(', '))].join('\n');
    const copy = raidElement('button','Copy Discord message');
    copy.addEventListener('click',async()=>{
      try { await navigator.clipboard.writeText(message.value); copy.textContent = 'Copied'; }
      catch { message.select(); }
    });
    preview.append(raidElement('summary','Preview Discord handoff'),message,copy); handoff.append(preview);
    if (organizer && assignments.length) {
      const report = raidElement('button','Report scheduled tasks complete');
      report.addEventListener('click',()=>change({action:'prep-report',ids:assignments.map(task=>task.id)},report));
      handoff.append(report,raidElement('small','Reports are recorded separately from readiness checks.'));
    }
    output.replaceChildren(card,activities,handoff);
  });
}
