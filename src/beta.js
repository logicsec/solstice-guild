// The review experience shares the production data and permissions, but owns its shell.
export function betaPage(page) {
  return page.replace('<title>Solstice Guild</title>','<title>Solstice · Design preview</title><meta name="robots" content="noindex,nofollow">')
    .replace('</head>','<link rel="stylesheet" href="/assets/beta.css?v=2"></head>')
    .replace('class="guild-app"','class="guild-app beta-workspace"')
    .replace('\nroute();','\nbootBetaWorkspace();\nroute();');
}

export function bootBetaWorkspace() {
  if(location.pathname!=='/beta'&&location.pathname!=='/beta/')return;
  if(!new URLSearchParams(location.search).has('tool')){
    const url=new URL(location.href);
    url.searchParams.set('tool','raid');
    if(!url.searchParams.has('view'))url.searchParams.set('view','guildDashboard');
    history.replaceState(null,'',url);
  }
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  const top=el('header',null,'beta-topbar');
  const label=el('strong','Design preview','beta-badge');
  const link=el('a','Current site');link.href='/?tool=raid&view=guildDashboard';
  top.append(label,link);
  document.querySelector('.raid-content').prepend(top);

  const menu=document.getElementById('raidMenu');
  const hall=menu.querySelector('.guild-menu-group');
  const overview=hall.querySelector('[data-raid-view="guildDashboard"]');
  overview.replaceChildren(tablerIcon('layout-dashboard'),el('span','Overview'));
  const events=hall.querySelector('[data-raid-view="calendar"]');
  const roster=el('button');
  roster.type='button';
  roster.append(tablerIcon('users'),el('span','Guild roster'));
  roster.dataset.betaNav='roster';
  roster.addEventListener('click',()=>openRaidView('guildCharacters'));
  const home=menu.querySelector('.guild-home-link');
  menu.prepend(home,overview,roster,events);
  hall.hidden=true;
  document.querySelector('.guild-sidebar-brand').href='/beta';
  menu.querySelector('[data-raid-view="raiding"] span').textContent='Raid teams';
}

export async function renderBetaGuildHub(root,{request,navigate,openCharacter,isCurrent=()=>true,rosterOnly=false,specs={}}){
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
  const btn=(text,fn,cls)=>{const n=el('button',text,cls);n.type='button';n.addEventListener('click',fn);return n;};
  const goTeam=id=>{const u=new URL(location.href);u.search=new URLSearchParams({tool:'raid',view:'raiding',team:id});history.pushState(null,'',u);navigate('raiding',false);};
  const newTeam=()=>{history.pushState(null,'','/beta?tool=raid&view=raiding&teams=new');navigate('raiding',false);};
  const now=Date.now(),range='?from='+encodeURIComponent(new Date(now).toISOString())+'&to='+encodeURIComponent(new Date(now+56*86400000).toISOString());
  root.replaceChildren(el('p','Loading your guild…','beta-loading'));
  const results=await Promise.allSettled([rosterOnly?null:request('/api/raid-teams'),request('/api/raid-characters?guild=1'),rosterOnly?null:request('/api/guild-events'+range)]);
  if(!isCurrent())return;
  root.replaceChildren();
  const teams=results[0].status==='fulfilled'?results[0].value?.teams??[]:[];
  const roster=results[1].status==='fulfilled'?results[1].value:null;
  const characters=roster?.characters??[];
  const events=results[2].status==='fulfilled'?[...results[2].value?.events??[]].sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)):[];
  const warnings=results.flatMap((r,i)=>r.status==='rejected'?[['Raid teams','Guild roster','Upcoming events'][i]+' could not be loaded.']:[]);
  if(roster?.warning)warnings.push(roster.warning);
  if(warnings.length){const notice=el('div',null,'beta-notice');notice.setAttribute('role','status');notice.append(el('p',warnings.join(' ')),btn('Retry',()=>renderBetaGuildHub(root,{request,navigate,openCharacter,isCurrent,rosterOnly,specs})));root.append(notice);}
  if(!rosterOnly){
    const hero=el('section',null,'beta-guild-hero');const copy=el('div');copy.append(el('p','ALLIANCE GUILD · WOW FOREVER','beta-eyebrow'),el('h1','Solstice'),el('p','US Normal · Alliance'));hero.append(copy,btn('+ New team',newTeam,'beta-primary'));root.append(hero);
    const stats=el('div',null,'beta-stats');for(const [icon,value,label] of [['users',roster?characters.length:'—','Guild characters'],['swords',results[0].status==='fulfilled'?teams.length:'—','Raid teams'],['calendar-event',results[2].status==='fulfilled'?events.filter(e=>e.type==='Raid').length:'—','Upcoming raids']]){const n=el('div');n.append(tablerIcon(icon),el('strong',String(value)),el('span',label));stats.append(n);}root.append(stats);
    const heading=el('header',null,'beta-section-heading');const copyTeams=el('div');copyTeams.append(el('h2','Raid teams'));heading.append(copyTeams,btn('View all teams',()=>{history.pushState(null,'','/beta?tool=raid&view=raiding&teams=all');navigate('raiding',false);},'beta-text-button'));root.append(heading);
    const cards=el('div',null,'beta-team-grid');
    for(const team of teams.slice(0,3)){
      const card=btn('',()=>goTeam(team.id),'beta-team-card');const art=el('img');art.src='/assets/raid-'+({10:'barrow-deeps',20:'hyjal-summit',40:'onyxias-lair'}[team.size]||'hyjal-summit')+'.webp';art.alt='';const body=el('div',null,'beta-team-card-body');
      const title=el('div',null,'beta-card-title');title.append(el('h3',team.name),el('span',team.mains+' / '+team.size,'beta-capacity'));body.append(title,el('p',team.size+'-player team · '+(team.region||'us').toUpperCase()+' '+({1:'PvP',2:'Normal',3:'RP',15:'RP-PvP'}[team.ruleset]||'Normal')));
      const next=events.find(e=>e.type==='Raid'&&e.team_id===team.id);body.append(el('small',next?'Next raid · '+new Intl.DateTimeFormat('en-US',{weekday:'short',hour:'numeric',minute:'2-digit'}).format(new Date(next.starts_at)):'No raid scheduled'));
      const meter=el('div',null,'beta-meter');const fill=el('span');fill.style.width=Math.min(100,team.mains/team.size*100)+'%';meter.append(fill);body.append(meter,el('small',team.characters+' characters · '+(team.canEdit?'You lead this team':'Guild team')));card.append(art,body);cards.append(card);
    }
    if(!teams.length){const empty=el('div',null,'beta-empty');empty.append(tablerIcon('swords'),el('h3','Your next raid starts here'),el('p','Create a team, bring in your guild roster, and build a lineup together.'),btn('Create your first team',newTeam,'beta-primary'));cards.append(empty);}root.append(cards);
    const agenda=el('section',null,'beta-surface beta-agenda');const h=el('header',null,'beta-section-heading');h.append(el('h2','Coming up'),btn('Open calendar',()=>navigate('calendar'),'beta-text-button'));agenda.append(h);
    for(const event of events.slice(0,4)){const row=btn('',()=>event.type==='Raid'?navigate('detail',true,event.id):navigate('calendar'),'beta-agenda-row');const date=new Date(event.starts_at);const stamp=el('span',null,'beta-date');stamp.append(el('small',new Intl.DateTimeFormat('en-US',{weekday:'short'}).format(date)),el('strong',new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(date)));const copy=el('span');copy.append(el('strong',event.title),el('small',event.team_name||event.type));row.append(stamp,copy,el('span',new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit'}).format(date)),el('small',(event.signups??0)+' signed up'));agenda.append(row);}
    if(!events.length)agenda.append(el('p',results[2].status==='fulfilled'?'No upcoming events. Plan your next guild night in the calendar.':'Events are temporarily unavailable.','beta-empty-copy'));root.append(agenda);
  }
  const directory=el('section',null,'beta-surface beta-directory');const heading=el('header',null,'beta-section-heading');const title=el('div');title.append(el('h2','Guild roster'),el('p',characters.length+' characters · Solstice · US Normal'));heading.append(title);if(!rosterOnly)heading.append(btn('View full roster',()=>navigate('guildCharacters'),'beta-text-button'));directory.append(heading);
  const tools=el('div',null,'beta-roster-tools');const search=el('input');search.type='search';search.placeholder='Search characters…';search.setAttribute('aria-label','Search guild characters');const filters=el('div',null,'beta-filter-panel');filters.hidden=true;const toggle=btn('Filters',()=>{filters.hidden=!filters.hidden;toggle.setAttribute('aria-expanded',String(!filters.hidden));});toggle.setAttribute('aria-expanded','false');tools.append(search,toggle);directory.append(tools,filters);
  const inputs={};
  for(const [key,label,values] of [['race','Race',[...new Set(characters.map(c=>c.race).filter(Boolean))].sort()],['class_name','Class',Object.keys(specs).sort()],['spec','Spec',[...new Set(Object.values(specs).flatMap(v=>v.map(([name])=>name)))].sort()]]){const field=el('label',label),select=el('select');select.add(new Option('All '+label.toLowerCase()+'s',''));for(const value of values)select.add(new Option(value,value));select.setAttribute('aria-label','Filter by '+label.toLowerCase());field.append(select);filters.append(field);inputs[key]=select;}
  for(const [key,label] of [['min','Min level'],['max','Max level']]){const field=el('label',label),input=el('input');input.type='number';input.min='1';input.max='60';input.setAttribute('aria-label',label);field.append(input);filters.append(field);inputs[key]=input;}
  const count=el('p','','beta-result-count');const table=el('table');const head=el('thead'),tr=el('tr');for(const label of ['Character','Class / specialization','Role','Level']){const th=el('th',label);th.scope='col';tr.append(th);}head.append(tr);const rows=el('tbody');table.append(head,rows);const scroll=el('div',null,'beta-table-scroll');scroll.append(table);directory.append(count,scroll);root.append(directory);
  function draw(){
    const q=search.value.trim().toLowerCase();const visible=characters.filter(c=>[c.name,c.class_name,c.spec,c.role].join(' ').toLowerCase().includes(q)&&Object.entries(inputs).every(([key,input])=>!input.value||(key==='min'?c.level!=null&&c.level>=Number(input.value):key==='max'?c.level!=null&&c.level<=Number(input.value):c[key]===input.value)));
    count.textContent=visible.length+' of '+characters.length+' characters';rows.replaceChildren();
    for(const c of (rosterOnly||q||Object.values(inputs).some(i=>i.value)?visible:visible.slice(0,6))){const row=el('tr');const name=el('td');const open=btn('',()=>{const dialog=el('dialog',null,'team-character-dialog');dialog.setAttribute('aria-label',c.name+' character details');const header=el('header',null,'team-character-dialog-header'),body=el('div');header.append(el('h3',c.name),btn('Back to guild',()=>dialog.close()));dialog.append(header,body);root.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();openCharacter({...c,character:c.name},body);},'beta-character-link');open.append(guildIcon('class',c.class_name),el('strong',c.name));name.append(open);row.append(name,el('td',[c.class_name,c.spec].filter(Boolean).join(' · ')),el('td',c.role||'Not set'),el('td',c.level==null?'—':String(c.level)));rows.append(row);}
    if(!visible.length){const row=el('tr'),cell=el('td',roster?'No characters match these filters.':'Guild roster could not be loaded.');cell.colSpan=4;row.append(cell);rows.append(row);}
  }
  search.addEventListener('input',draw);for(const input of Object.values(inputs))input.addEventListener('input',draw);draw();
}
