export function raidTeamSummary(members, mainsOnly=true){
  const characters=members.filter(member=>!mainsOnly||member.isMain);
  const roles=Object.fromEntries(['Tank','Healer','Melee DPS','Ranged DPS','Not set'].map(role=>[role,characters.filter(member=>(member.role||'Not set')===role).length]));
  const armor={Cloth:['Mage','Priest','Warlock'],Leather:['Druid','Rogue'],Mail:['Hunter','Shaman'],Plate:['Paladin','Warrior']};
  const levels=characters.map(member=>member.itemLevel).filter(value=>Number.isFinite(value)&&value>=0);
  return {total:characters.length,roles,armor:Object.entries(armor).map(([name,classes])=>({name,classes,count:characters.filter(member=>classes.includes(member.className)).length})),itemLevels:{known:levels.length,average:levels.length?levels.reduce((a,b)=>a+b,0)/levels.length:null,min:levels.length?Math.min(...levels):null,max:levels.length?Math.max(...levels):null}};
}

export async function renderRaidTeams(root,{request,specs,isCurrent=()=>true,renderPlanner,renderCalendar}){
  const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;if(cls)node.className=cls;return node;};
  const btn=(text,action,cls)=>{const node=el('button',text,cls);node.type='button';node.addEventListener('click',action);return node;};
  const icon=name=>tablerIcon(name);
  const roles=['Tank','Healer','Melee DPS','Ranged DPS'];
  const roleIcons={'Tank':'shield-check','Healer':'heart','Melee DPS':'swords','Ranged DPS':'target','Not set':'user-circle'};
  let teamId=new URLSearchParams(location.search).get('team');
  let section=new URLSearchParams(location.search).get('section')||'roster';
  if(!['roster','report','calendar','planner','professions','settings'].includes(section))section='roster';
  let data=null,teams=[],tab='team',query='',mode='role',mainsOnly=true,selected=new Set(),revision=0,professions=null,saving=false;
  const status=el('p','','teams-status');status.setAttribute('role','status');
  const content=el('div',null,'teams-content');
  const dialog=el('dialog',null,'team-edit-dialog');dialog.setAttribute('aria-label','Create raid team');
  const form=el('form');const formTitle=el('h3','New raid team');
  const name=el('input');name.required=true;name.maxLength=60;name.placeholder='e.g. Solstice Progression';name.setAttribute('aria-label','Team name');
  const description=el('textarea');description.maxLength=500;description.setAttribute('aria-label','Team description');
  const size=el('select');size.setAttribute('aria-label','Team raid size');for(const value of [10,20,40])size.add(new Option(value+' players',value));
  const accent=el('input');accent.type='color';accent.value='#7b70ef';accent.setAttribute('aria-label','Banner color');
  const formStatus=el('p');formStatus.setAttribute('role','status');const save=btn('Create team',()=>{});save.type='submit';
  for(const [label,input] of [['Team name',name],['Description',description],['Raid size',size],['Banner color',accent]]){const field=el('label',label);field.append(input);form.append(field);}
  form.prepend(formTitle);form.append(save,btn('Cancel',()=>dialog.close()),formStatus);dialog.append(form);
  root.replaceChildren(status,content,dialog);
  function path(){const url=new URL(location.href);url.searchParams.set('tool','raid');url.searchParams.set('view','raiding');if(teamId){url.searchParams.set('team',teamId);url.searchParams.set('section',section);}else{url.searchParams.delete('team');url.searchParams.delete('section');}if(url.href!==location.href)history.pushState(null,'',url);}
  function openForm(){name.value='';description.value='';size.value='20';accent.value='#7b70ef';formStatus.textContent='';dialog.showModal();name.focus();}
  form.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;formStatus.textContent='Creating…';try{const result=await request('',{action:'create',name:name.value.trim(),description:description.value.trim(),size:Number(size.value),accent:accent.value});teamId=result.id;section='roster';dialog.close();path();await load();}catch(error){formStatus.textContent=error.message;}finally{save.disabled=false;}});
  async function load(){
    const token=++revision;status.textContent='Loading raid teams…';
    try{const result=await request(teamId?'?team='+encodeURIComponent(teamId):'');if(token!==revision||!isCurrent())return;
      if(teamId){data=result;professions=null;status.textContent=result.roster.warning||'';drawWorkspace();loadProfiles(token);}else{teams=result.teams;status.textContent='';drawLanding();}
    }catch(error){if(token===revision&&isCurrent()){status.textContent=error.message;content.replaceChildren(btn('Retry',load),btn('All teams',()=>{teamId=null;path();load();}));}}
  }
  function drawLanding(){
    content.replaceChildren();const heading=el('header',null,'teams-landing-heading');const title=el('div');title.append(el('h2','Raid Teams'),el('p','Build a roster, plan your composition, and prepare to raid together.'));heading.append(title,btn('+ New team',openForm));content.append(heading);
    const grid=el('div',null,'teams-grid');
    for(const team of teams){const card=btn('',()=>{teamId=team.id;section='roster';selected.clear();path();load();},'team-tile');card.style.setProperty('--team-accent',team.accent);const avatar=el('span',team.name.charAt(0).toUpperCase(),'team-avatar');const text=el('span');text.append(el('strong',team.name),el('small','WoW Forever · '+team.mains+' mains · '+team.characters+' characters'),el('small',team.canEdit?'Team leader':'Guild team'));card.append(avatar,text,icon('shield-check'));grid.append(card);}
    if(!teams.length)grid.append(el('p','Create your first raid team to start assigning guild characters.','teams-empty'));content.append(grid);
    const planner=btn('Open Group Planner',()=>{teamId=null;section='planner';drawStandalonePlanner();},'teams-planner-link');content.append(planner);
  }
  function drawStandalonePlanner(){content.replaceChildren(btn('All raid teams',()=>{section='roster';drawLanding();}));const panel=el('div');content.append(panel);renderPlanner?.(panel,null);}
  async function loadProfiles(token){
    if(!data.members.length)return;
    try{const result=await request('?team='+encodeURIComponent(teamId)+'&profiles=1');if(token!==revision||!isCurrent())return;data.members=result.members;if(['roster','report'].includes(section))for(const card of content.querySelectorAll('.team-summary'))card.replaceWith(summary());}catch{}
  }
  function navigate(next){section=next;selected.clear();path();drawWorkspace();}
  function drawWorkspace(){
    if(!isCurrent())return;content.replaceChildren();const team=data.team;content.style.setProperty('--team-accent',team.accent);
    const banner=el('header',null,'team-banner');const identity=el('div',null,'team-banner-identity');identity.append(el('span',team.name.charAt(0).toUpperCase(),'team-avatar'));const text=el('div');text.append(el('h2',team.name),el('p','US · Normal'),el('span','WoW Forever','team-version'));identity.append(text);banner.append(identity);if(team.canEdit)banner.append(btn('Edit banner',()=>navigate('settings')));content.append(banner);
    const layout=el('div',null,'team-workspace');const nav=el('nav',null,'team-navigation');nav.setAttribute('aria-label','Raid team navigation');
    nav.append(btn('All raid teams',()=>{teamId=null;path();load();},'team-back'));
    nav.append(el('small','ROSTER'),el('strong',data.members.length+' / 150 characters'));const meter=el('div',null,'team-meter');const progress=el('span');progress.style.width=Math.min(100,data.members.length/150*100)+'%';meter.append(progress);nav.append(meter);
    for(const [group,items] of [['OVERVIEW',[['report','Roster Report','clipboard-list'],['calendar','Guild Calendar','calendar-event']]],['ROSTER',[['roster','Roster','users'],['planner','Group Planner','layout-dashboard'],['professions','Professions','hammer']]],['SETTINGS',[['settings','Settings','settings']]]]){
      nav.append(el('small',group));for(const [key,label,symbol] of items){const item=btn('',()=>navigate(key));item.append(icon(symbol),el('span',label));item.setAttribute('aria-current',String(section===key));nav.append(item);}
    }
    const panel=el('section',null,'team-panel');layout.append(nav,panel);content.append(layout);
    const heading=el('header',null,'team-section-heading');const sectionTitle=el('h3');sectionTitle.append(icon({roster:'users',report:'clipboard-list',calendar:'calendar-event',planner:'layout-dashboard',professions:'hammer',settings:'settings'}[section]||'users'),el('span',{roster:'Roster',report:'Roster Report',calendar:'Guild Calendar',planner:'Group Planner',professions:'Professions',settings:'Settings'}[section]||'Roster'));heading.append(sectionTitle);panel.append(heading);
    if(section==='roster'){heading.append(el('p','Your raid team and the wider guild roster.'));drawRoster(panel);}
    else if(section==='report'){heading.append(el('p','Composition, armor distribution and available gear data.'));panel.append(summary());const classes=el('section',null,'raid-card team-class-report');classes.append(el('h3','Class breakdown'));for(const className of Object.keys(specs)){const count=data.members.filter(member=>member.className===className&&(!mainsOnly||member.isMain)).length;const row=el('div');row.append(guildIcon('class',className),el('span',className),el('strong',String(count)));classes.append(row);}panel.append(classes);}
    else if(section==='planner'){const target=el('div');panel.append(target);renderPlanner?.(target,teamId);}
    else if(section==='calendar'){heading.append(el('p','Guild events shared across Solstice.'));const target=el('div');panel.append(target);renderCalendar?.(target);heading.append(btn('New event',()=>{const form=target.querySelector('#planGuildEvent');if(form){form.hidden=false;form.scrollIntoView({block:'nearest'});form.querySelector('input')?.focus();}}));}
    else if(section==='professions')drawProfessions(panel);
    else if(section==='settings')drawSettings(panel);
  }
  function summary(){
    const stats=raidTeamSummary(data.members,mainsOnly);const card=el('aside',null,'raid-card team-summary');card.setAttribute('aria-label','Raid summary');
    const header=el('header');header.append(el('h3','Raid summary'));const toggle=el('div',null,'team-segmented');for(const [label,value] of [['Mains',true],['All',false]]){const item=btn(label,()=>{mainsOnly=value;drawWorkspace();});item.setAttribute('aria-pressed',String(mainsOnly===value));toggle.append(item);}header.append(toggle);card.append(header);
    const composition=el('section');const title=el('div',null,'team-summary-label');title.append(el('strong','Composition'),el('small',stats.total+' '+(mainsOnly?'mains':'characters')));composition.append(title);
    const bar=el('div',null,'team-composition-bar');for(const role of roles){const segment=el('span');segment.dataset.role=role;segment.style.width=(stats.total?stats.roles[role]/stats.total*100:0)+'%';segment.title=role+': '+stats.roles[role];bar.append(segment);}composition.append(bar);
    const counts=el('div',null,'team-summary-counts');for(const role of roles){const row=el('div');row.dataset.role=role;row.append(icon(roleIcons[role]),el('span',role==='Melee DPS'?'Melee':role==='Ranged DPS'?'Ranged':role==='Tank'?'Tanks':'Healers'),el('strong',String(stats.roles[role])));counts.append(row);}composition.append(counts);if(stats.roles['Not set'])composition.append(el('small',stats.roles['Not set']+' without a role set.'));card.append(composition);
    const gear=el('section');gear.append(el('strong','Item level'));if(!stats.itemLevels.known)gear.append(el('p','No gear data yet.'));else{gear.append(el('p',stats.itemLevels.average.toFixed(1)+' average','team-ilvl'),el('small',stats.itemLevels.min+'–'+stats.itemLevels.max+' · Data for '+stats.itemLevels.known+' of '+stats.total+' characters'));}card.append(gear);
    const armor=el('section');armor.append(el('strong','Armor types'));for(const entry of stats.armor){const row=el('div',null,'team-armor-row');const title=el('div');title.append(el('span',entry.name),el('small',entry.count+' · '+(stats.total?Math.round(entry.count/stats.total*100):0)+'%'));const meter=el('div',null,'team-meter');const fill=el('span');fill.style.width=(stats.total?entry.count/stats.total*100:0)+'%';meter.append(fill);const icons=el('div',null,'team-armor-icons');for(const className of entry.classes)icons.append(guildIcon('class',className));row.append(title,meter,icons);armor.append(row);}armor.append(el('small','Expected armor by class.'));card.append(armor);if(section!=='report'){const footer=el('footer');footer.append(btn('View full roster report',()=>navigate('report')));card.append(footer);}return card;
  }
  function tabs(){const nav=el('div',null,'team-roster-tabs');for(const [value,label,symbol] of [['team','Raid Team','users'],['guild','Guild Roster','swords']]){const item=btn('',()=>{tab=value;query='';selected.clear();drawWorkspace();});item.append(icon(symbol),el('span',label));item.setAttribute('aria-selected',String(tab===value));nav.append(item);}return nav;}
  function drawRoster(panel){
    panel.append(tabs());const layout=el('div',null,'team-roster-layout');const list=el('div',null,'team-roster-main');layout.append(list,summary());panel.append(layout);
    const tools=el('div',null,'team-roster-tools');const search=el('input');search.type='search';search.placeholder='Search name, class or spec';search.setAttribute('aria-label','Search team roster');search.value=query;const rows=el('div');
    search.addEventListener('input',()=>{query=search.value;drawRows(rows);});tools.append(search);
    if(tab==='team'){const select=el('select');select.setAttribute('aria-label','Group roster by');select.add(new Option('Role','role'));select.add(new Option('Guild rank','rank'));select.value=mode;select.addEventListener('change',()=>{mode=select.value;drawRows(rows);});tools.append(select);}
    else tools.append(btn('Refresh guild roster',async()=>{try{status.textContent='Refreshing guild roster…';const result=await request('?team='+teamId,{action:'refresh'});await load();status.textContent=result.roster.warning||'Guild roster refreshed.';}catch(error){status.textContent=error.message;}}));list.append(tools,rows);drawRows(rows);
  }
  function identity(character){const node=el('span',null,'team-character-identity');node.dataset.wowClass=character.className;node.append(guildIcon('class',character.className));if(character.spec)node.append(guildIcon('spec',character.spec,'',character.className));const name=btn(character.name,()=>{if(character.slug)location.href='/character?character='+encodeURIComponent(character.name)+'&name='+encodeURIComponent(character.slug);},'team-character-link');node.append(name);return node;}
  async function change(input){if(saving)return;saving=true;status.textContent='Saving team…';for(const control of content.querySelectorAll('button,input,select'))control.disabled=true;try{await request('?team='+teamId,input);selected.clear();await load();status.textContent='Team updated.';}catch(error){status.textContent=error.message;}finally{saving=false;if(isCurrent()&&data)drawWorkspace();}}
  function drawRows(target){
    const scrollTop=target.querySelector('.team-table-scroll')?.scrollTop??0;
    target.replaceChildren();const term=query.trim().toLowerCase();const matches=character=>[character.name,character.className,character.spec,character.role].join(' ').toLowerCase().includes(term);
    if(tab==='guild'){
      const pool=data.roster.characters.filter(matches);const assigned=new Set(data.members.flatMap(member=>[member.key,member.guildKey].filter(Boolean)));
      const banner=el('div',null,'team-guild-banner');banner.append(el('strong',data.roster.guild+' · US Normal'),el('small',data.roster.characters.length+' characters found · '+data.members.filter(member=>member.inGuild).length+' assigned to this team'+(data.roster.updatedAt?' · Synced '+new Date(data.roster.updatedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'')));if(data.roster.warning)banner.append(el('p',data.roster.warning));target.append(banner);
      const bulk=el('div',null,'team-bulk-actions');bulk.append(el('strong',selected.size+' selected'));const assign=btn('Assign to team',()=>change({action:'assign',characters:[...selected]}));assign.disabled=!selected.size||!data.team.canEdit;bulk.append(btn('Clear',()=>{selected.clear();drawRows(target);}),assign);target.append(bulk);
      const scroller=el('div',null,'team-table-scroll');const table=el('table');const head=el('thead');const heading=el('tr');
      for(const label of ['', 'Character','Spec','Level','ILVL','Rank','Status',''])heading.append(el('th',label));head.append(heading);table.append(head);const body=el('tbody');
      for(const character of pool){
        const row=el('tr');row.dataset.wowClass=character.className;const checkbox=el('input');checkbox.type='checkbox';checkbox.checked=selected.has(character.key);checkbox.disabled=assigned.has(character.key)||!data.team.canEdit;checkbox.setAttribute('aria-label','Select '+character.name);checkbox.addEventListener('change',()=>{if(checkbox.checked)selected.add(character.key);else selected.delete(character.key);drawRows(target);});const check=el('td');check.append(checkbox);const who=el('td');who.append(identity(character));row.append(check,who,el('td',character.spec||'—'),el('td',character.level??'—'),el('td',data.members.find(member=>member.key===character.key)?.itemLevel??character.itemLevel??'—'),el('td',character.rank===0?'GM':character.rank??'—'),el('td',assigned.has(character.key)?'On team':'Unassigned'));
        const action=el('td');if(!assigned.has(character.key)&&data.team.canEdit)action.append(btn('Assign',()=>change({action:'assign',characters:[character.key]})));row.append(action);body.append(row);
      }
      table.append(body);scroller.append(table);target.append(scroller);scroller.scrollTop=scrollTop;if(!pool.length)target.append(el('p','No guild characters match your search.'));return;
    }
    const members=data.members.filter(matches);const buckets=mode==='role'?[...roles,'Not set']:[...new Set(members.map(member=>member.rank??'Unknown'))].sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true}));
    for(const key of buckets){const characters=members.filter(member=>mode==='role'?(member.role||'Not set')===key:(member.rank??'Unknown')===key);const group=el('section',null,'team-role-group');const heading=el('header');heading.dataset.role=key;heading.append(icon(mode==='role'?roleIcons[key]:'shield'),el('strong',mode==='role'?key.toUpperCase():key===0?'GUILD MASTER':'RANK '+key),el('small',String(characters.length)));if(data.team.canEdit)heading.append(btn('+ Add',()=>{tab='guild';query='';drawWorkspace();}));group.append(heading);
      for(const member of characters){const row=el('div',null,'team-member-row');row.append(identity(member));const fields=el('div',null,'team-member-fields');
        const spec=el('select');spec.setAttribute('aria-label','Specialization for '+member.name);spec.add(new Option('Spec not set',''));for(const [name] of specs[member.className]??[])spec.add(new Option(name,name));spec.value=member.spec;spec.disabled=!data.team.canEdit;
        const role=el('select');role.setAttribute('aria-label','Role for '+member.name);role.add(new Option('Role not set',''));for(const name of roles)role.add(new Option(name,name));role.value=member.role;role.disabled=!data.team.canEdit;
        const update=(values)=>change({action:'update',character:member.key,spec:member.spec,role:member.role,isMain:member.isMain,...values});
        spec.addEventListener('change',()=>{const selection=specs[member.className].find(([name])=>name===spec.value);update({spec:spec.value,role:selection?.[1]??''});});role.addEventListener('change',()=>update({role:role.value}));
        const main=btn(member.isMain?'★ Main':'Alt',()=>update({isMain:!member.isMain}),'team-main-toggle');main.disabled=!data.team.canEdit;main.setAttribute('aria-label',(member.isMain?'Mark as alt: ':'Mark as main: ')+member.name);main.setAttribute('aria-pressed',String(member.isMain));fields.append(spec,role,main);
        if(data.team.canEdit)fields.append(btn('Remove',()=>change({action:'remove',character:member.key}),'team-remove'));row.append(fields);if(!member.inGuild)row.append(el('small','Not in the current guild roster.'));group.append(row);
      }
      target.append(group);
    }
    if(!data.members.length)target.append(el('p','Open Guild Roster and assign characters to build this raid team.','teams-empty'));
  }
  function drawSettings(panel){
    if(!data.team.canEdit){panel.append(el('p','Only the team leader can change team settings.'));return;}
    const form=el('form',null,'team-settings-form');const inputs={};
    for(const [key,label,type,value] of [['name','Team name','text',data.team.name],['description','Description','text',data.team.description],['size','Raid size','select',data.team.size],['accent','Banner color','color',data.team.accent]]){const labelNode=el('label',label);const field=el(type==='select'?'select':'input');if(type==='select')for(const size of [10,20,40])field.add(new Option(size+' players',size));else field.type=type;field.value=String(value);field.maxLength=key==='name'?60:500;field.required=key==='name';inputs[key]=field;labelNode.append(field);form.append(labelNode);}
    const save=btn('Save settings',()=>{});save.type='submit';form.append(save);form.addEventListener('submit',event=>{event.preventDefault();change({action:'settings',name:inputs.name.value,description:inputs.description.value,size:Number(inputs.size.value),accent:inputs.accent.value});});panel.append(form);
  }
  function drawProfessions(panel){
    if(!professions){const loading=el('p','Loading team professions…');panel.append(loading);const token=revision;request('?team='+teamId+'&section=professions').then(result=>{if(token!==revision||!isCurrent()||section!=='professions')return;professions=result;drawWorkspace();}).catch(error=>{loading.textContent=error.message;panel.append(btn('Retry',()=>drawWorkspace()));});return;}
    panel.append(el('p',professions.reviewed+' of '+data.members.length+' team characters reported profession data.'));
    const search=el('input');search.type='search';search.placeholder='Who can craft it? Search a recipe or item';search.setAttribute('aria-label','Search team recipes');const results=el('div');panel.append(search,results,el('small','Recipe search includes recipes confirmed on Solstice.'));
    const draw=()=>{results.replaceChildren();const term=search.value.trim().toLowerCase();if(term){const crafts=professions.crafts.filter(craft=>[craft.recipe_name,craft.result_name,craft.character,craft.profession].join(' ').toLowerCase().includes(term));for(const craft of crafts){const row=el('div',null,'team-profession-row');row.append(guildIcon('profession',craft.profession),el('strong',craft.result_name||craft.recipe_name),el('span',craft.character+' · '+craft.profession));results.append(row);}if(!crafts.length)results.append(el('p','No confirmed team recipes match.'));return;}
      for(const profession of ['Alchemy','Blacksmithing','Enchanting','Engineering','Herbalism','Leatherworking','Mining','Skinning','Tailoring','Cooking','Fishing','First Aid']){
        const coverage=professions.professions.find(([name])=>name===profession);const slugs=coverage?.[3]??[];const members=data.members.filter(member=>slugs.includes(member.slug));const details=el('details',null,'team-profession');const summary=el('summary',null,'team-profession-row');summary.append(guildIcon('profession',profession),el('strong',profession));const names=el('span');if(members.length)for(const member of members)names.append(identity(member));else names.append(el('small',professions.reviewed<data.members.length?'Not reported yet':'Nobody yet'));summary.append(names,icon('chevron-right'));details.append(summary);
        for(const member of members){const rank=coverage[4]?.find(([slug])=>slug===member.slug)?.[1];const row=el('div',null,'team-profession-detail');row.append(identity(member),el('small',rank?.skill!=null?rank.skill+' / '+(rank.maxSkill??'—'):'Skill unavailable'));details.append(row);}results.append(details);
      }
    };search.addEventListener('input',draw);draw();
  }
  await load();
}
