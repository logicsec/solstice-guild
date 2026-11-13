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
