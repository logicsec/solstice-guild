import {matchesGuildRosterFilter} from './guild-roster-filters.js';

export function raidTeamSummary(members, mainsOnly=true){
  const characters=members.filter(member=>!mainsOnly||member.isMain);
  const roles=Object.fromEntries(['Tank','Healer','Melee DPS','Ranged DPS','Not set'].map(role=>[role,characters.filter(member=>(member.role||'Not set')===role).length]));
  const armor={Cloth:['Mage','Priest','Warlock'],Leather:['Druid','Rogue'],Mail:['Hunter','Shaman'],Plate:['Paladin','Warrior']};
  const levels=characters.map(member=>member.itemLevel).filter(value=>Number.isFinite(value)&&value>=0);
  return {total:characters.length,roles,armor:Object.entries(armor).map(([name,classes])=>({name,classes,count:characters.filter(member=>classes.includes(member.className)).length})),itemLevels:{known:levels.length,average:levels.length?levels.reduce((a,b)=>a+b,0)/levels.length:null,min:levels.length?Math.min(...levels):null,max:levels.length?Math.max(...levels):null}};
}

export async function renderRaidTeams(root,{request,specs,isCurrent=()=>true,renderPlanner,renderRaidBanner,navigationRoot,openCharacter,raidInstances={}}){
  const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;if(cls)node.className=cls;return node;};
  const btn=(text,action,cls)=>{const node=el('button',text,cls);node.type='button';node.addEventListener('click',action);return node;};
  const icon=name=>tablerIcon(name);
  const banner=(title,description,actionLabel,onAction)=>{
    if(renderRaidBanner)return renderRaidBanner(title,description,actionLabel,onAction);
    const header=el('header',null,'guild-page-heading raid-section-banner');
    const intro=el('div');
    intro.append(el('p','Alliance Guild','eyebrow'),el('h2',title),el('p',description));
    header.append(intro);
    if(onAction)header.append(btn(actionLabel,onAction,'raid-primary'));
    return header;
  };
  const rulesets={2:'Normal',1:'PvP',3:'RP',15:'RP-PvP'};
  const contextLabel=team=>(team.region||'us').toUpperCase()+' · '+(rulesets[team.ruleset||2]||'Normal');
  const roles=['Tank','Healer','Melee DPS','Ranged DPS'];
  const roleIcons={'Tank':'shield-check','Healer':'heart','Melee DPS':'swords','Ranged DPS':'target','Not set':'user-circle'};
  let teamId=new URLSearchParams(location.search).get('team');
  if(!teamId&&!['all','new'].includes(new URLSearchParams(location.search).get('teams')))try{teamId=localStorage.getItem('solstice-working-raid-team')||null;}catch{}
  let section=new URLSearchParams(location.search).get('section')||'roster';
  let creating=new URLSearchParams(location.search).get('teams')==='new';
  if(!['roster','planner','professions','settings','setup'].includes(section))section='roster';
  let data=null,teams=[],tab='team',query='',mode='role',mainsOnly=true,selected=new Set(),revision=0,professions=null,saving=false;
  let filtersOpen=false;const rosterFilters={race:'',className:'',spec:'',minLevel:'',maxLevel:''};
  const status=el('p','','teams-status');status.setAttribute('role','status');
  const content=el('div',null,'teams-content');
  let creationStep='size';
  const creationPage=el('section',null,'team-create-page');creationPage.hidden=true;creationPage.setAttribute('aria-label','Create raid team');
  const form=el('form',null,'team-create-form');const formTitle=el('h3','Your team');const selectedSize=el('p','','team-create-selection');const fields=el('div',null,'team-create-fields');
  const name=el('input');name.required=true;name.maxLength=60;name.placeholder='e.g. Solstice Progression';name.setAttribute('aria-label','Team name');
  const description=el('textarea');description.maxLength=500;description.setAttribute('aria-label','Team description');
  const size=el('select');size.setAttribute('aria-label','Team raid size');for(const value of [10,20,40])size.add(new Option(value+' players',value));
  const region=el('select');region.setAttribute('aria-label','Team region');for(const value of ['us','eu','kr','tw'])region.add(new Option(value.toUpperCase(),value));region.value='us';
  const ruleset=el('select');ruleset.setAttribute('aria-label','Team ruleset');
  function drawRulesets(){const previous=ruleset.value||'2';ruleset.replaceChildren();for(const value of [2,1,3,15])if(!['kr','tw'].includes(region.value)||[2,1].includes(value))ruleset.add(new Option(rulesets[value],String(value)));ruleset.value=['kr','tw'].includes(region.value)&&!['1','2'].includes(previous)?'2':previous;}
  region.addEventListener('change',drawRulesets);drawRulesets();
  const accent=el('input');accent.type='color';accent.value='#7b70ef';accent.setAttribute('aria-label','Banner color');
  const formStatus=el('p');formStatus.setAttribute('role','status');const save=btn('Create team',()=>{});save.type='submit';
  for(const [caption,input] of [['Team name',name],['Region',region],['Ruleset',ruleset]]){const field=el('label',caption);field.append(input);fields.append(field);}
  const extra=el('details',null,'team-create-extra');extra.append(el('summary','Description and banner color'));for(const [caption,input] of [['Description',description],['Banner color',accent]]){const field=el('label',caption);field.append(input);extra.append(field);}
  const actions=el('div',null,'team-create-actions');actions.append(btn('Back to raid sizes',()=>{creationStep='size';drawCreation();}),save,btn('Cancel',()=>{creating=false;path();drawLanding();}));
  form.append(formTitle,selectedSize,fields,extra,actions,formStatus);
  const characterDialog=el('dialog',null,'team-character-dialog');characterDialog.setAttribute('aria-label','Character details');
  const characterHeader=el('header',null,'team-character-dialog-header');const characterTitle=el('h3','Character details');const characterClose=btn('Back to team',()=>characterDialog.close());characterHeader.append(characterTitle,characterClose);
  const characterBody=el('div');characterDialog.append(characterHeader,characterBody);
  characterDialog.addEventListener('close',()=>characterBody.replaceChildren());
  const scheduleDialog=el('dialog',null,'team-schedule-dialog');scheduleDialog.setAttribute('aria-label','Set weekly raid times');
  root.replaceChildren(status,content,characterDialog,scheduleDialog);
  function path(){const url=new URL(location.href);url.searchParams.set('tool','raid');url.searchParams.set('view','raiding');if(teamId){url.searchParams.set('team',teamId);url.searchParams.set('section',section);url.searchParams.delete('teams');try{localStorage.setItem('solstice-working-raid-team',teamId);}catch{}}else{url.searchParams.delete('team');url.searchParams.delete('section');url.searchParams.set('teams',creating?'new':'all');}if(url.href!==location.href)history.pushState(null,'',url);}
  function openForm(){creating=true;creationStep='size';name.value='';description.value='';size.value='';accent.value='#7b70ef';region.value='us';ruleset.value='2';drawRulesets();formStatus.textContent='';creationPage.hidden=false;path();drawCreation();}
  function drawCreation(){
    creationPage.dataset.step=creationStep;
    creationPage.replaceChildren();
    const heading=banner('Create a raid team',creationStep==='size'?'Choose a raid size to continue.':'Enter your team information.','All raid teams',()=>{creating=false;path();drawLanding();});
    const cards=el('div',null,'team-size-cards');cards.setAttribute('role','group');cards.setAttribute('aria-label','Choose raid size');
    const continueActions=el('div',null,'team-create-next');const next=btn('Next',()=>{if(![10,20,40].includes(Number(size.value)))return;creationStep='details';drawCreation();name.focus();},'raid-primary');continueActions.append(next);
    function choose(value){size.value=String(value);continueActions.hidden=creationStep!=='size';selectedSize.textContent=value+'-player team · WoW Forever';for(const card of cards.children)card.setAttribute('aria-pressed',String(card.dataset.raidSize===String(value)));}
    for(const value of [10,20,40]){
      const raids=Object.entries(raidInstances).filter(([,raid])=>raid.size===value);const card=btn('',()=>choose(value),'team-size-card');card.dataset.raidSize=String(value);card.setAttribute('aria-label',value+'-player raids');
      const art=el('span',null,'team-size-art');if(raids.length){const image=el('img');image.src='/assets/raid-'+raids[0][0]+'.webp';image.alt=raids[0][1].name;art.append(image);}const selected=el('span',null,'team-size-selected');selected.append(icon('check'));art.append(selected);
      const body=el('span',null,'team-size-copy');body.append(el('span','WoW Forever','team-size-game'),el('strong',value+'-player raids','team-size-title'),el('small',raids.map(([,raid])=>raid.name).join(' · ')||'No raids configured for this size.','team-size-raids'));
      card.append(art,body);cards.append(card);
    }
    const hasSize=[10,20,40].includes(Number(size.value));
    for(const card of cards.children)card.setAttribute('aria-pressed','false');
    if(hasSize)choose(Number(size.value));
    continueActions.hidden=creationStep!=='size'||!hasSize;cards.hidden=creationStep!=='size';form.hidden=creationStep!=='details';
    const stage=el('div',null,'team-create-stage');stage.append(cards,continueActions,form);creationPage.append(heading,stage);content.replaceChildren(creationPage);
  }
  form.addEventListener('submit',async event=>{event.preventDefault();if(creationStep!=='details'||![10,20,40].includes(Number(size.value))){creationStep='size';drawCreation();return;}save.disabled=true;formStatus.textContent='Creating…';try{const result=await request('',{action:'create',name:name.value.trim(),description:description.value.trim(),size:Number(size.value),accent:accent.value,region:region.value,ruleset:Number(ruleset.value)});teamId=result.id;section='setup';creating=false;creationPage.hidden=true;path();await load();}catch(error){formStatus.textContent=error.message;}finally{save.disabled=false;}});
  async function load(){
    const token=++revision;status.textContent='Loading raid teams…';content.inert=true;if(navigationRoot)navigationRoot.inert=true;
    try{const [result,list]=await Promise.all([request(teamId?'?team='+encodeURIComponent(teamId):''),teamId?request('').catch(()=>null):null]);if(token!==revision||!isCurrent())return;
      if(teamId){data=result;teams=list?.teams??[result.team];if(!teams.some(team=>team.id===teamId))teams.push(result.team);professions=null;status.textContent=result.roster.warning||'';path();drawWorkspace();loadProfiles(token);}else{teams=result.teams;status.textContent='';if(creating)openForm();else drawLanding();}
    }catch(error){if(token===revision&&isCurrent()){status.textContent=error.message;data=null;drawNavigation();content.replaceChildren(btn('Retry',load),btn('All teams',()=>{teamId=null;path();load();}));}}finally{if(token===revision&&isCurrent()){content.inert=false;if(navigationRoot)navigationRoot.inert=false;}}
  }
  function drawLanding(){
    drawNavigation();
    content.replaceChildren(banner('Raid Teams','Build a roster, plan your composition, and prepare to raid together.','+ New team',openForm));
    const grid=el('div',null,'teams-grid');
    for(const team of teams){const card=btn('',()=>{teamId=team.id;section='roster';selected.clear();path();load();},'team-tile');card.style.setProperty('--team-accent',team.accent);const avatar=el('span',team.name.charAt(0).toUpperCase(),'team-avatar');const text=el('span');text.append(el('strong',team.name),el('small',contextLabel(team)+' · WoW Forever'),el('small',team.mains+' mains · '+team.characters+' characters'),el('small',team.canEdit?'Team leader':'Guild team'));card.append(avatar,text,icon('shield-check'));grid.append(card);}
    if(!teams.length)grid.append(el('p','Create your first raid team to start assigning guild characters.','teams-empty'));content.append(grid);
  }
  async function loadProfiles(token){
    if(!data.members.length)return;
    try{const result=await request('?team='+encodeURIComponent(teamId)+'&profiles=1');if(token!==revision||!isCurrent())return;data.members=result.members;if(section==='roster')for(const card of content.querySelectorAll('.team-summary'))card.replaceWith(summary());}catch{}
  }
  function navigate(next){section=next;selected.clear();path();drawWorkspace();}
  function drawNavigation(){
    if(!navigationRoot||!isCurrent())return;
    navigationRoot.replaceChildren();
    const label=el('label','WORKING TEAM','team-working-label');label.setAttribute('for','workingRaidTeam');
    const picker=el('div',null,'team-working-picker');const current=teams.find(team=>team.id===teamId);
    const avatar=el('span',current?.name.charAt(0).toUpperCase()||'—','team-working-avatar');avatar.style.setProperty('--team-accent',current?.accent||'var(--theme-tertiary-bg)');avatar.setAttribute('aria-hidden','true');
    const select=el('select');select.id='workingRaidTeam';select.setAttribute('aria-label','Working raid team');select.add(new Option('Select a team',''));for(const team of teams)select.add(new Option(team.name,team.id));select.value=teamId||'';
    select.addEventListener('change',()=>{creating=false;teamId=select.value||null;section='roster';tab='team';query='';selected.clear();for(const key of Object.keys(rosterFilters))rosterFilters[key]='';filtersOpen=false;path();load();});
    picker.append(avatar,select);navigationRoot.append(label,picker);
    if(teamId&&data)for(const [key,label,symbol] of [['roster','Roster','users'],['planner','Group Planner','layout-dashboard'],['professions','Team Professions','hammer'],['settings','Team Settings','settings'],['setup','Team Setup','clipboard-list']]){
      const item=btn('',()=>navigate(key),'team-menu-item');item.append(icon(symbol),el('span',label));item.setAttribute('aria-current',String(section===key));navigationRoot.append(item);
    }
    const all=btn('',()=>{creating=false;teamId=null;section='roster';selected.clear();path();load();},'team-menu-all');all.append(icon('layout-dashboard'),el('span','All raid teams'));navigationRoot.append(all);
  }
  function drawWorkspace(){
    if(!isCurrent())return;content.replaceChildren();const team=data.team;content.style.setProperty('--team-accent',team.accent);
    const teamContext=contextLabel(team)+' · WoW Forever';
    content.append(banner(
      section==='planner'?'Group Planner':team.name,
      section==='planner'?team.name+' · '+teamContext:teamContext,
    ));
    drawNavigation();const layout=el('div',null,'team-workspace');
    const panel=el('section',null,'team-panel');layout.append(panel);content.append(layout);
    if(section==='planner'){renderPlanner?.(panel,teamId);return;}
    if(section==='roster'){drawRoster(panel);return;}
    const heading=el('header',null,'team-section-heading');const sectionTitle=el('h3');sectionTitle.append(icon({professions:'hammer',settings:'settings',setup:'clipboard-list'}[section]||'users'),el('span',{professions:'Professions',settings:'Settings',setup:'Set up your raid team'}[section]||'Roster'));heading.append(sectionTitle);panel.append(heading);
    if(section==='setup'){drawSetup(panel);}
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
    const armor=el('section');armor.append(el('strong','Armor types'));for(const entry of stats.armor){const row=el('div',null,'team-armor-row');const title=el('div');title.append(el('span',entry.name),el('small',entry.count+' · '+(stats.total?Math.round(entry.count/stats.total*100):0)+'%'));const meter=el('div',null,'team-meter');const fill=el('span');fill.style.width=(stats.total?entry.count/stats.total*100:0)+'%';meter.append(fill);const icons=el('div',null,'team-armor-icons');for(const className of entry.classes)icons.append(guildIcon('class',className));row.append(title,meter,icons);armor.append(row);}armor.append(el('small','Expected armor by class.'));card.append(armor);return card;
  }
  function tabs(){const nav=el('div',null,'team-roster-tabs');for(const [value,label,symbol] of [['team','Raid Team','users'],['guild','Guild Roster','swords']]){const item=btn('',()=>{tab=value;query='';selected.clear();drawWorkspace();});item.append(icon(symbol),el('span',label));item.setAttribute('aria-selected',String(tab===value));nav.append(item);}return nav;}
  function drawRoster(panel){
    panel.append(tabs());const layout=el('div',null,'team-roster-layout');const list=el('div',null,'team-roster-main');layout.append(list,summary());panel.append(layout);
    const tools=el('div',null,'team-roster-tools');const search=el('input');search.type='search';search.placeholder='Search name, class or spec';search.setAttribute('aria-label','Search team roster');search.value=query;const rows=el('div');
    search.addEventListener('input',()=>{query=search.value;drawRows(rows);});tools.append(search);
    const filterPanel=el('div',null,'guild-roster-advanced team-filter-panel');filterPanel.id='teamRosterFilters';filterPanel.hidden=!filtersOpen;
    const filterButton=btn('',()=>{filtersOpen=!filtersOpen;filterPanel.hidden=!filtersOpen;filterButton.setAttribute('aria-expanded',String(filtersOpen));},'team-filter-button');
    filterButton.setAttribute('aria-controls','teamRosterFilters');filterButton.setAttribute('aria-expanded',String(filtersOpen));
    const updateButton=()=>{const count=Object.values(rosterFilters).filter(Boolean).length;filterButton.replaceChildren(icon('adjustments-horizontal'),el('span','Filters'+(count?' ('+count+')':'')));};updateButton();tools.append(filterButton);
    const race=el('select');race.setAttribute('aria-label','Filter team roster by race');race.add(new Option('All races',''));
    const raceNames=[...new Set([...data.roster.characters,...data.members].map(character=>character.race).filter(Boolean))].sort();for(const name of raceNames)race.add(new Option(name,name));race.add(new Option('Not reported','__unknown__'));race.value=rosterFilters.race;
    const className=el('select');className.setAttribute('aria-label','Filter team roster by class');className.add(new Option('All classes',''));for(const name of Object.keys(specs).sort())className.add(new Option(name,name));className.value=rosterFilters.className;
    const spec=el('select');spec.setAttribute('aria-label','Filter team roster by specialization');
    const specOptions=()=>{spec.replaceChildren(new Option('All specs',''));const names=rosterFilters.className?(specs[rosterFilters.className]??[]).map(([name])=>name):Object.values(specs).flatMap(entries=>entries.map(([name])=>name));for(const name of [...new Set(names)].sort())spec.add(new Option(name,name));spec.add(new Option('Not set','__unknown__'));if(rosterFilters.spec&&!names.includes(rosterFilters.spec)&&rosterFilters.spec!=='__unknown__')rosterFilters.spec='';spec.value=rosterFilters.spec;};specOptions();
    const minimum=el('input'),maximum=el('input');for(const input of [minimum,maximum]){input.type='number';input.min='1';input.max='60';}minimum.placeholder='1';maximum.placeholder='60';minimum.value=rosterFilters.minLevel;maximum.value=rosterFilters.maxLevel;minimum.setAttribute('aria-label','Minimum team character level');maximum.setAttribute('aria-label','Maximum team character level');
    for(const [label,input] of [['Race',race],['Class',className],['Spec',spec],['Min level',minimum],['Max level',maximum]]){const field=el('label',label);field.append(input);filterPanel.append(field);}
    const apply=()=>{updateButton();drawRows(rows);};
    race.addEventListener('change',()=>{rosterFilters.race=race.value;apply();});className.addEventListener('change',()=>{rosterFilters.className=className.value;specOptions();apply();});spec.addEventListener('change',()=>{rosterFilters.spec=spec.value;apply();});minimum.addEventListener('input',()=>{rosterFilters.minLevel=minimum.value;apply();});maximum.addEventListener('input',()=>{rosterFilters.maxLevel=maximum.value;apply();});
    filterPanel.append(btn('Reset filters',()=>{for(const key of Object.keys(rosterFilters))rosterFilters[key]='';race.value='';className.value='';minimum.value='';maximum.value='';specOptions();apply();}));

    if(tab==='team'){const select=el('select');select.setAttribute('aria-label','Group roster by');select.add(new Option('Role','role'));select.add(new Option('Guild rank','rank'));select.value=mode;select.addEventListener('change',()=>{mode=select.value;drawRows(rows);});tools.append(select);}
    else tools.append(btn('Refresh guild roster',async()=>{try{status.textContent='Refreshing guild roster…';await request('?team='+teamId,{action:'refresh'});await load();}catch(error){status.textContent=error.message;}}));list.append(tools,filterPanel,rows);drawRows(rows);
  }
  function identity(character){const node=el('span',null,'team-character-identity');node.dataset.wowClass=character.className;node.append(guildIcon('class',character.className));if(character.spec)node.append(guildIcon('spec',character.spec,'',character.className));const name=btn(character.name,()=>{if(openCharacter){characterTitle.textContent=character.name;openCharacter({...character,region:data.team.region||'us'},characterBody,()=>characterDialog.close());characterDialog.showModal();characterClose.focus();}else if(character.slug)location.href='/character?character='+encodeURIComponent(character.name)+'&name='+encodeURIComponent(character.slug);},'team-character-link');node.append(name);return node;}
  async function change(input){if(saving)return;saving=true;if(navigationRoot)navigationRoot.inert=true;status.textContent='Saving team…';for(const control of content.querySelectorAll('button,input,select'))control.disabled=true;try{await request('?team='+teamId,input);selected.clear();await load();return true;}catch(error){status.textContent=error.message;return false;}finally{saving=false;if(navigationRoot&&isCurrent())navigationRoot.inert=false;if(isCurrent()&&data)drawWorkspace();}}
  function drawRows(target){
    const scrollTop=target.querySelector('.team-table-scroll')?.scrollTop??0;
    target.replaceChildren();const matches=character=>matchesGuildRosterFilter({...character,class_name:character.className},{...rosterFilters,query});
    if(tab==='guild'&&data.roster.source==='unlinked'){target.append(el('p','Link your in-game guild to choose its members.'),btn('Link guild',()=>navigate('setup')));return;}
    if(tab==='guild'){
      const pool=data.roster.characters.filter(matches);const assigned=new Set(data.members.flatMap(member=>[member.key,member.guildKey].filter(Boolean)));
      const banner=el('div',null,'team-guild-banner');banner.append(el('strong',(data.roster.guild||'No guild linked')+' · '+contextLabel(data.team)),el('small',data.roster.characters.length+' characters found · '+data.members.filter(member=>member.inGuild).length+' assigned to this team'+(data.roster.updatedAt?' · Synced '+new Date(data.roster.updatedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'')));if(data.roster.warning)banner.append(el('p',data.roster.warning));target.append(banner,el('p','Showing '+pool.length+' of '+data.roster.characters.length+' guild characters.','team-filter-count'));
      const bulk=el('div',null,'team-bulk-actions');bulk.append(el('strong',selected.size+' selected'));const assign=btn('Assign to team',()=>change({action:'assign',characters:[...selected]}));assign.disabled=!selected.size||!data.team.canEdit;bulk.append(btn('Clear',()=>{selected.clear();drawRows(target);}),assign);target.append(bulk);
      const scroller=el('div',null,'team-table-scroll');const table=el('table');const head=el('thead');const heading=el('tr');
      for(const label of ['', 'Character','Spec','Level','ILVL','Rank','Status',''])heading.append(el('th',label));head.append(heading);table.append(head);const body=el('tbody');
      for(const character of pool){
        const row=el('tr');row.dataset.wowClass=character.className;const checkbox=el('input');checkbox.type='checkbox';checkbox.checked=selected.has(character.key);checkbox.disabled=assigned.has(character.key)||!data.team.canEdit;checkbox.setAttribute('aria-label','Select '+character.name);checkbox.addEventListener('change',()=>{if(checkbox.checked)selected.add(character.key);else selected.delete(character.key);drawRows(target);});const check=el('td');check.append(checkbox);const who=el('td');who.append(identity(character));row.append(check,who,el('td',character.spec||'—'),el('td',character.level??'—'),el('td',data.members.find(member=>member.key===character.key)?.itemLevel??character.itemLevel??'—'),el('td',character.rank===0?'GM':character.rank??'—'),el('td',assigned.has(character.key)?'On team':'Unassigned'));
        const action=el('td');if(!assigned.has(character.key)&&data.team.canEdit)action.append(btn('Assign',()=>change({action:'assign',characters:[character.key]})));row.append(action);body.append(row);
      }
      table.append(body);scroller.append(table);target.append(scroller);scroller.scrollTop=scrollTop;if(!pool.length)target.append(el('p','No guild characters match your search.'));return;
    }
    const members=data.members.filter(matches);target.append(el('p','Showing '+members.length+' of '+data.members.length+' team characters.','team-filter-count'));const buckets=mode==='role'?[...roles,'Not set']:[...new Set(members.map(member=>member.rank??'Unknown'))].sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true}));
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
    if(data.members.length&&!members.length)target.append(el('p','No team characters match your filters.','teams-empty'));
    if(!data.members.length)target.append(el('p','Open Guild Roster and assign characters to build this raid team.','teams-empty'));
  }
  function openSchedule(){
    scheduleDialog.replaceChildren();const form=el('form');const header=el('header');header.append(el('h3','When does your team raid?'),btn('Close',()=>scheduleDialog.close()));form.append(header,el('p','Choose your weekly nights. Preview the next eight weeks before creating events.'));
    let kind='Progress',previewRevision=0;const selectedDays=new Map();
    const kinds=el('div',null,'team-schedule-kinds');kinds.setAttribute('role','group');kinds.setAttribute('aria-label','Raid night type');for(const value of ['Progress','Farm','Optional','Off night']){const item=btn(value,()=>{kind=value;for(const choice of kinds.children)choice.setAttribute('aria-pressed',String(choice.textContent===kind));instanceField.hidden=kind==='Off night';instance.required=kind!=='Off night';preview();});item.setAttribute('aria-pressed',String(value===kind));kinds.append(item);}form.append(kinds);
    const instance=el('select');instance.required=true;instance.setAttribute('aria-label','Scheduled raid instance');for(const [key,value] of Object.entries(raidInstances))instance.add(new Option(value.name+' · '+value.size+' players',key));instance.value=Object.entries(raidInstances).find(([,value])=>value.size===data.team.size)?.[0]||Object.keys(raidInstances)[0]||'';
    const instanceField=el('label','Raid instance');instanceField.append(instance);form.append(instanceField);instance.addEventListener('change',()=>preview());
    const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];const days=el('div',null,'team-schedule-days');days.setAttribute('aria-label','Raid days');days.setAttribute('role','group');
    const globalStart=el('input'),globalEnd=el('input');globalStart.type=globalEnd.type='time';globalStart.value='20:00';globalEnd.value='23:00';globalStart.setAttribute('aria-label','Default raid start time');globalEnd.setAttribute('aria-label','Default raid end time');
    const zone=el('select');zone.setAttribute('aria-label','Raid time zone');const currentZone=Intl.DateTimeFormat().resolvedOptions().timeZone;for(const value of [...new Set([currentZone,'America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Europe/London','Europe/Berlin','Asia/Seoul','Asia/Taipei','UTC'])])zone.add(new Option(value,value));zone.value=currentZone;
    const times=el('div',null,'team-schedule-times');for(const [caption,input] of [['Start',globalStart],['End',globalEnd],['Time zone',zone]]){const label=el('label',caption);label.append(input);times.append(label);}
    const perDay=el('div',null,'team-schedule-per-day');
    function drawDays(){perDay.replaceChildren();for(const [day,selection] of [...selectedDays].sort(([a],[b])=>a-b)){const row=el('div');row.append(el('strong',weekdays[day]));for(const key of ['start','end']){const input=el('input');input.type='time';input.value=selection[key];input.required=true;input.setAttribute('aria-label',weekdays[day]+' '+key+' time');input.addEventListener('change',()=>{selection[key]=input.value;preview();});row.append(input);}perDay.append(row);}}
    for(let day=0;day<7;day++){const item=btn(weekdays[day],()=>{if(selectedDays.has(day))selectedDays.delete(day);else selectedDays.set(day,{day,start:globalStart.value,end:globalEnd.value});item.setAttribute('aria-pressed',String(selectedDays.has(day)));drawDays();preview();});item.setAttribute('aria-pressed','false');days.append(item);}form.append(days,times,el('small','Each selected night can have its own start and end time.'),perDay);
    for(const [input,key] of [[globalStart,'start'],[globalEnd,'end']])input.addEventListener('change',()=>{for(const selection of selectedDays.values())selection[key]=input.value;drawDays();preview();});zone.addEventListener('change',()=>preview());
    const feedback=el('p','Select your raid days to preview the schedule.');feedback.setAttribute('role','status');const dates=el('details');dates.append(el('summary','See dates'));const list=el('div');dates.append(list);const save=btn('Start raiding',()=>{});save.type='submit';save.disabled=true;const actions=el('div',null,'team-create-actions');actions.append(save,btn('Cancel',()=>scheduleDialog.close()));form.append(feedback,dates,actions);
    function input(){return{kind,instance:instance.value,timezone:zone.value,days:[...selectedDays.values()]};}
    async function preview(){const token=++previewRevision;save.disabled=true;list.replaceChildren();if(!selectedDays.size){feedback.textContent='Select your raid days to preview the schedule.';return;}feedback.textContent='Checking dates…';try{const result=await request('?team='+teamId,{action:'previewSchedule',...input()});if(token!==previewRevision)return;feedback.textContent=kind==='Off night'?'These are non-raiding nights. No raid events will be created.':result.dates.length+' raids over the next 8 weeks. Future dates top up when the calendar opens.';for(const date of result.dates)list.append(el('p',new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short',timeZone:zone.value}).format(new Date(date.startsAt))+' – '+new Intl.DateTimeFormat(undefined,{timeStyle:'short',timeZone:zone.value}).format(new Date(date.endsAt))));save.disabled=kind!=='Off night'&&!result.dates.length;}catch(error){if(token===previewRevision)feedback.textContent=error.message;}}
    form.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;feedback.textContent='Saving raid nights…';const result=await change({action:'schedule',...input()});if(result)scheduleDialog.close();else{feedback.textContent=status.textContent;save.disabled=false;}});scheduleDialog.append(form);scheduleDialog.showModal();
  }
  function drawSetup(panel){
    const team=data.team,setup=data.setup||{joined:false,schedules:[],permissionConfirmed:false};
    const box=el('div',null,'team-setup');box.append(el('p','FIRST-TIME SETUP · WOW FOREVER','team-setup-eyebrow'),el('p','Link your guild, bring your raiders together, and get your raid nights on the calendar.'));
    const completed=[!!team.guildSlug,setup.joined,data.members.length>0,setup.schedules.length>0,setup.permissionConfirmed];
    const titles=['Link your guild','Add yourself to the team','Bring in your team','Set your raid times','Set what your team can do'];
    const descriptions=['Bring in the guild roster from Battle.net.','Join this team with your Discord account.','Choose guild characters and share the team with your raiders.','Choose weekly raid nights and preview the dates.','Choose the permissions new team members receive.'];
    const first=completed.findIndex(done=>!done);
    for(let index=0;index<5;index++){
      const step=el('details',null,'team-setup-step');step.open=index===first;step.dataset.complete=String(completed[index]);const summary=el('summary');summary.append(icon(completed[index]?'check':'user-circle'),el('strong',titles[index]),icon('chevron-down'));step.append(summary,el('p',descriptions[index]));
      if(index===0){
        step.append(el('small',contextLabel(team)));if(team.guildSlug)step.append(el('p',team.guildName+' linked · '+data.roster.characters.length+' guild characters'));
        if(team.canManage??team.canEdit){const form=el('form',null,'team-link-guild');const guild=el('input');guild.required=true;guild.maxLength=100;guild.placeholder='In-game guild name';guild.value=team.guildName||'';guild.setAttribute('aria-label','Guild name');const link=btn(team.guildSlug?'Refresh guild link':'Link guild',()=>{});link.type='submit';form.append(guild,link);form.addEventListener('submit',event=>{event.preventDefault();change({action:'linkGuild',guild:guild.value});});step.append(form);}
      }else if(index===1){step.append(setup.joined?el('p','You are on this team.'):btn('Join this team',()=>change({action:'join'})));}
      else if(index===2){
        step.append(el('p',data.members.length+' characters assigned to this team.'));if(team.canEdit)step.append(btn('Choose guild members',()=>{tab='guild';navigate('roster');}));
        const invite=el('input');invite.readOnly=true;const url=new URL(location.href);url.searchParams.set('section','setup');invite.value=url.href;invite.setAttribute('aria-label','Team link');step.append(invite,el('small','Share this link with Solstice Discord members. They sign in and choose Join this team.'));
      }else if(index===3){
        for(const schedule of setup.schedules)step.append(el('p',schedule.kind+' · '+schedule.days.length+' nights a week · '+schedule.timezone));
        if(team.canEdit)step.append(btn('Set raid times',openSchedule));
      }else{
        const permission=el('select');permission.setAttribute('aria-label','Default team member role');for(const value of ['Viewer','Raider','Editor','Officer'])permission.add(new Option(value,value));permission.value=team.defaultRole||'Raider';permission.disabled=!(team.canManage??team.canEdit);
        step.append(permission,el('p','Viewer and Raider can view the team. Editor can manage its roster and raid times. Officer can also change team settings, guild links and permissions.'));
        if(team.canManage??team.canEdit)step.append(btn('Save permissions',()=>change({action:'permissions',defaultRole:permission.value})));
      }
      box.append(step);
    }
    const progress=el('progress');progress.max=5;progress.value=completed.filter(Boolean).length;progress.setAttribute('aria-label','Team setup progress');box.append(progress,el('small',completed.filter(Boolean).length+' / 5 complete'),btn('Skip to my team',()=>navigate('roster')));panel.append(box);
  }
  async function deleteTeam(){
    if(saving||!data?.team.isOwner)return;
    const team=data.team;
    if(!window.confirm('Delete “'+team.name+'”? This permanently removes its roster, team memberships and recurring schedules. Existing raid events will remain on the calendar.'))return;
    saving=true;content.inert=true;if(navigationRoot)navigationRoot.inert=true;status.textContent='Deleting team…';
    try{
      await request('?team='+teamId,{action:'delete',confirmName:team.name});
      try{if(localStorage.getItem('solstice-working-raid-team')===teamId)localStorage.removeItem('solstice-working-raid-team');localStorage.removeItem('solstice-composition-v1:'+teamId);}catch{}
      teamId=null;data=null;section='roster';selected.clear();path();await load();
    }catch(error){status.textContent=error.message;}finally{saving=false;if(isCurrent()){content.inert=false;if(navigationRoot)navigationRoot.inert=false;}}
  }
  function drawSettings(panel){
    if(!(data.team.canManage??data.team.canEdit)){panel.append(el('p','Only team leaders and officers can change team settings.'));return;}
    panel.append(el('p',contextLabel(data.team)+' · '+(data.team.guildName||'No guild linked')),btn('Open team setup',()=>navigate('setup')));
    const form=el('form',null,'team-settings-form');const inputs={};
    for(const [key,label,type,value] of [['name','Team name','text',data.team.name],['description','Description','text',data.team.description],['size','Raid size','select',data.team.size],['accent','Banner color','color',data.team.accent]]){const labelNode=el('label',label);const field=el(type==='select'?'select':'input');if(type==='select')for(const size of [10,20,40])field.add(new Option(size+' players',size));else field.type=type;field.value=String(value);field.maxLength=key==='name'?60:500;field.required=key==='name';inputs[key]=field;labelNode.append(field);form.append(labelNode);}
    const save=btn('Save settings',()=>{});save.type='submit';form.append(save);form.addEventListener('submit',event=>{event.preventDefault();change({action:'settings',name:inputs.name.value,description:inputs.description.value,size:Number(inputs.size.value),accent:inputs.accent.value});});panel.append(form);
    if(data.team.isOwner){const danger=el('section',null,'team-delete-danger');danger.append(el('h4','Delete team'),el('p','Permanently remove this team, its assigned roster, memberships and recurring schedules. Existing raid events stay on the calendar.'),btn('Delete team',deleteTeam,'raid-control-danger'));panel.append(danger);}
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
