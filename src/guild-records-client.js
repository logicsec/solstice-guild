export async function recordRequest(path, data) {
  const response = await fetch(path, data === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request failed.');
  return result;
}

export function recordField(form, name, label, type, maxLength) {
  const wrapper = raidElement('label', label);
  const input = raidElement(type === 'textarea' ? 'textarea' : 'input');
  if (type !== 'textarea') input.type = type;
  input.name = name;
  if (maxLength) input.maxLength = maxLength;
  wrapper.append(input); form.append(wrapper);
  return input;
}

export async function renderMeetings(root, current) {
  const path = '/api/meetings';
  const { meetings } = await recordRequest(path);
  if (!current()) return;
  const card = raidElement('section', null, 'raid-card');
  const editor = raidElement('section', null, 'raid-card');
  const list = raidElement('div');
  const add = raidElement('button', 'Schedule meeting', 'raid-primary');
  add.type = 'button';
  add.addEventListener('click', () => edit());
  card.append(add, raidElement('p', 'Meetings, agendas, and notes are visible to signed-in guild members.'), list);
  editor.hidden = true;
  root.append(card, editor);
  function draw(rows) {
    list.replaceChildren();
    if (!rows.length) list.append(raidElement('p', 'No meetings scheduled.'));
    for (const meeting of rows) {
      const details = raidElement('details', null, 'raid-card');
      details.append(raidElement('summary', meeting.title + ' · ' + raidDate(meeting.starts_at)),
        raidElement('p', raidDate(meeting.starts_at) + ' to ' + raidDate(meeting.ends_at)));
      if (meeting.location) details.append(raidElement('p', meeting.location, 'record-copy'));
      for (const [label, value] of [['Agenda', meeting.agenda], ['Meeting notes', meeting.notes]]) {
        details.append(raidElement('h4', label), raidElement('p', value || 'None added.', 'record-copy'));
      }
      if (meeting.editable) {
        const button = raidElement('button', 'Edit meeting or notes');
        button.type = 'button';
        button.addEventListener('click', () => edit(meeting));
        details.append(button);
      }
      list.append(details);
    }
  }
  function edit(meeting) {
    const localTime = value => {
      const date = new Date(value);
      return new Date(+date - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
    };
    const form = raidElement('form', null, 'raid-form');
    const title = recordField(form,'title','Title','text',120);
    const start = recordField(form,'start','Start (your local time)','datetime-local');
    const end = recordField(form,'end','End (your local time)','datetime-local');
    const location = recordField(form,'location','Location or voice channel','text',250);
    const agenda = recordField(form,'agenda','Agenda','textarea',8000);
    const notes = recordField(form,'notes','Meeting notes','textarea',16000);
    title.required = start.required = end.required = true;
    if (meeting) {
      title.value = meeting.title; start.value = localTime(meeting.starts_at); end.value = localTime(meeting.ends_at);
      location.value = meeting.location; agenda.value = meeting.agenda; notes.value = meeting.notes;
    }
    const save = raidElement('button','Save meeting','raid-primary');
    const cancel = raidElement('button','Cancel');
    cancel.type = 'button';
    const status = raidElement('p');
    status.setAttribute('role','status');
    cancel.addEventListener('click', () => { editor.hidden = true; add.focus(); });
    form.append(save, cancel, status);
    editor.replaceChildren(raidElement('h3', meeting ? 'Edit meeting' : 'Schedule meeting'), form);
    editor.hidden = false;
    title.focus();
    form.addEventListener('submit', async event => {
      event.preventDefault();
      save.disabled = true;
      try {
        const startDate = new Date(start.value), endDate = new Date(end.value);
        if (!(endDate > startDate)) throw new Error('The end time must be after the start.');
        const result = await recordRequest(path, { id: meeting?.id, revision: meeting?.revision, title: title.value,
          start: startDate.toISOString(), end: endDate.toISOString(), location: location.value, agenda: agenda.value, notes: notes.value });
        if (!current()) return;
        const saved = { id: result.id, title: title.value.trim(), starts_at: startDate.toISOString(), ends_at: endDate.toISOString(),
          location: location.value.trim(), agenda: agenda.value.trim(), notes: notes.value.trim(), editable: true, revision: (meeting?.revision ?? 0) + 1 };
        const now = new Date().toISOString();
        const rows = [...meetings.filter(row => row.id !== saved.id), saved].sort((a,b) => {
          const pastA = a.starts_at < now, pastB = b.starts_at < now;
          return Number(pastA) - Number(pastB) || (pastA ? b.starts_at.localeCompare(a.starts_at) : a.starts_at.localeCompare(b.starts_at));
        });
        meetings.splice(0,meetings.length,...rows);
        draw(meetings);
        editor.hidden = true;
        add.focus();
      } catch (error) { status.textContent = error.message; }
      finally { save.disabled = false; }
    });
  }
  draw(meetings);
}

export async function renderLootHistory(root, data) {
  const card = raidElement('section', null, 'raid-card');
  root.append(card);
  const raid = data?.event.id;
  const path = '/api/raid-loot-awards' + (raid ? '?raid=' + encodeURIComponent(raid) : '');
  async function draw() {
    const { awards, history } = await recordRequest(path);
    if (!card.isConnected) return;
    card.replaceChildren(raidElement('h3','Loot history'),raidElement('p','Recorded awards for the last 12 raids with loot entries.'));
    if (history.length) {
      const graph = raidElement('ol',null,'loot-history-graph');
      graph.setAttribute('aria-label','Recorded awards by raid');
      const max = Math.max(...history.map(entry => entry.awards));
      for (const entry of history) {
        const row = raidElement('li');
        const bar = raidElement('progress');
        bar.max = max; bar.value = entry.awards;
        bar.setAttribute('aria-hidden','true');
        row.append(raidElement('span',entry.title+' · '+raidDate(entry.starts_at)),raidElement('strong',String(entry.awards)),bar);
        graph.append(row);
      }
      card.append(graph);
    } else card.append(raidElement('p','No awards recorded yet.'));
    if (!raid) return;
    card.append(raidElement('h4','Awards for '+data.event.title));
    const status = raidElement('p');
    status.setAttribute('role','status');
    for (const award of awards) {
      const row = raidElement('div',null,'raid-row');
      row.append(raidElement('strong',award.item+' → '+award.recipient),raidElement('small',raidDate(award.recorded_at)));
      if (award.note) row.append(raidElement('p',award.note,'record-copy'));
      if (data.organizer) {
        const remove = raidElement('button','Remove award');
        remove.type = 'button';
        remove.addEventListener('click',async () => {
          if (!confirm('Remove this recorded award?')) return;
          remove.disabled = true;
          try { await recordRequest(path,{ action:'remove', raid, id:award.id }); await draw(); }
          catch (error) { status.textContent = error.message; remove.disabled = false; }
        });
        row.append(remove);
      }
      card.append(row);
    }
    if (!awards.length) card.append(raidElement('p','No awards recorded for this raid.'));
    if (data.organizer) {
      const form = raidElement('form',null,'raid-form');
      const item = recordField(form,'item','Item','text',120);
      const recipient = recordField(form,'recipient','Receiving character','text',80);
      const note = recordField(form,'note','Award note (optional)','text',400);
      item.required = recipient.required = true;
      const submit = raidElement('button','Record award','raid-primary');
      form.append(submit);
      card.append(form);
      let id = crypto.randomUUID();
      form.addEventListener('submit',async event => {
        event.preventDefault();
        submit.disabled = true;
        try {
          await recordRequest(path,{ raid, id, item:item.value, recipient:recipient.value, note:note.value });
          id = crypto.randomUUID();
          form.reset();
          await draw();
        } catch (error) { status.textContent = error.message; }
        finally { submit.disabled = false; }
      });
    }
    card.append(status);
  }
  await draw();
}
