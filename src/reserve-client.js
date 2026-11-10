export function showReserveHistory(raidId, key, name) {
  const dialog = raidElement('dialog',null,'workspace-drawer');
  const heading = raidElement('h3',name+' · Reserve history');
  heading.id = 'reserve-history-title';
  dialog.setAttribute('aria-labelledby',heading.id);
  const close = raidElement('button','Close');
  close.addEventListener('click',()=>dialog.close());
  const body = raidElement('div');
  body.append(raidElement('p','Loading reserve history…'));
  const header = raidElement('header',null,'workspace-drawer-heading');
  header.append(heading,close);
  dialog.append(header,body);
  document.body.append(dialog);
  dialog.addEventListener('close',()=>dialog.remove());
  dialog.showModal();
  raidRequest('/'+raidId+'?reserveHistory='+encodeURIComponent(key)).then(({history})=>{
    body.replaceChildren();
    if (!history.length) body.append(raidElement('p','No reserves recorded yet.'));
    for (const raid of history) {
      const row = raidElement('div',null,'raid-row');
      row.append(raidElement('strong',raid.title),raidElement('small',raidDate(raid.starts_at)+' · '+raid.character),
        raidElement('p',raid.items.join(' · ')));
      body.append(row);
    }
  }).catch(error=>body.replaceChildren(raidElement('p',error.message)));
}

export function renderRaidReserves(root,{event,organizer,roster,mine,reserves,pendingReserves,myReserveItems}) {
  root.replaceChildren(raidElement('h3','Loot reserves'),
    raidElement('p',(event.reserves_locked ? 'Locked' : event.state === 'Cancelled' ? 'Closed' : 'Open')+' · '+event.reserve_limit+' per player'));
  const status = raidElement('p');
  status.setAttribute('role','status');
  root.append(status);
  async function save(button,data) {
    button.disabled = true;
    try {
      await raidRequest('/'+event.id,data);
      if (activeRaid === event.id) await openRaidView('detail',event.id,false);
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  }
  if (organizer) {
    const settings = raidElement('div',null,'raid-actions');
    const label = raidElement('label','Picks per player ');
    const limit = raidElement('select');
    for (const value of [1,2,3,4,5]) limit.add(new Option(value,value));
    limit.value = event.reserve_limit;
    label.append(limit);
    const update = raidElement('button','Save limit');
    update.addEventListener('click',()=>save(update,{action:'reserve-settings',limit:Number(limit.value)}));
    const lock = raidElement('button',event.reserves_locked ? 'Unlock reserves' : 'Lock reserves');
    lock.addEventListener('click',()=>save(lock,{action:'reserve-settings',locked:!event.reserves_locked}));
    settings.append(label,update,lock); root.append(settings);
    if (pendingReserves.length) root.append(raidElement('h4','Guest requests awaiting review'));
    for (const request of pendingReserves) {
      const row = raidElement('div',null,'raid-row');
      const approve = raidElement('button','Approve');
      approve.disabled = Boolean(event.reserves_locked) || event.state === 'Cancelled';
      approve.addEventListener('click',()=>save(approve,{action:'reserve-review',key:request.key,approve:true}));
      const decline = raidElement('button','Decline');
      decline.addEventListener('click',()=>save(decline,{action:'reserve-review',key:request.key,approve:false}));
      row.append(raidElement('strong',request.character),raidElement('span',request.items.join(' · ')),approve,decline);
      root.append(row);
    }
  }
  if (!reserves.length) root.append(raidElement('p','No reserves recorded yet.'));
  for (const pick of reserves) {
    const row = raidElement('div',null,'raid-row');
    row.append(raidElement('strong',pick.character),raidElement('span',pick.items.join(' · ')));
    if (organizer) {
      const history = raidElement('button','Reserve history');
      history.addEventListener('click',()=>showReserveHistory(event.id,pick.key,pick.character));
      row.append(history);
    }
    root.append(row);
  }
  if (mine) {
    const history = raidElement('button','My reserve history');
    history.addEventListener('click',()=>showReserveHistory(event.id,'',mine.character));
    root.append(history);
  }
  if (event.reserves_locked || event.state === 'Cancelled') return;
  if (!organizer && mine?.status !== 'Going') {
    root.append(raidElement('p','Once your RSVP is confirmed, you can add your reserves.'));
    return;
  }

  const form = raidElement('form',null,'raid-form');
  const label = raidElement('label','Item names (one per line)');
  const items = raidElement('textarea');
  items.rows = 3;
  items.maxLength = 605;
  items.placeholder = 'Leave blank to clear the picks';
  label.append(items);
  let player;
  let guest;
  if (organizer) {
    const playerLabel = raidElement('label','Raider');
    player = raidElement('select');
    player.add(new Option('Guest without Discord',''));
    for (const entry of roster.filter(row=>row.status === 'Going')) player.add(new Option(entry.character,entry.member));
    if (player.options.length > 1) player.selectedIndex = 1;
    playerLabel.append(player);
    const guestLabel = raidElement('label','Guest character name');
    guest = raidElement('input');
    guest.maxLength = 61;
    guestLabel.append(guest);
    function loadPicks() {
      guestLabel.hidden = Boolean(player.value);
      guest.required = !player.value;
      const key = player.value ? 'member:'+player.value : 'guest:'+guest.value.trim().replace(/\s+/g,' ').toLowerCase();
      items.value = reserves.find(entry=>entry.key === key)?.items.join('\n') ?? '';
    }
    player.addEventListener('change',loadPicks);
    guest.addEventListener('change',loadPicks);
    form.append(playerLabel,guestLabel);
    loadPicks();
  } else {
    items.value = myReserveItems.join('\n');
  }
  const submit = raidElement('button','Save reserves','raid-primary');
  form.append(label,submit); root.append(form);
  form.addEventListener('submit',e=>{
    e.preventDefault();
    const data = {action:'reserve-picks',items:items.value.split(/\r?\n/).map(item=>item.trim()).filter(Boolean)};
    if (organizer) {
      if (player.value) data.member = player.value;
      else data.guest = guest.value;
    }
    save(submit,data);
  });
}
