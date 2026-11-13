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

  const page = raidElement('section', null, 'meeting-page');
  root.append(page);
  const button = (name, action, style) => {
    const node = raidElement('button', name, style);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  };
  const toolbar = () => raidElement('div', null, 'meeting-toolbar');
  const prefix = 'meeting-document-v1\n';

  // Rebuild allowed blocks and text only. Stored markup never enters the live DOM directly.
  function documentContent(value) {
    const fragment = document.createDocumentFragment();
    const allowed = new Set(['P','DIV','H2','H3','H4','UL','OL','LI','BR','B','STRONG','I','EM','BLOCKQUOTE']);
    const source = document.createElement('template');
    source.innerHTML = value;
    function append(parent, nodes) {
      for (const node of nodes) {
        if (node.nodeType === Node.TEXT_NODE) parent.append(document.createTextNode(node.textContent));
        else if (allowed.has(node.nodeName)) {
          const child = document.createElement(node.localName);
          if (node.getAttribute('data-task') === 'true' && node.nodeName === 'LI') {
            child.dataset.task = 'true';
            child.dataset.done = String(node.getAttribute('data-done') === 'true');
          }
          append(child, node.childNodes);
          parent.append(child);
        } else if (node.nodeName === 'SPAN' || node.nodeName === 'A') append(parent, node.childNodes);
      }
    }
    append(fragment, source.content.childNodes);
    return fragment;
  }

  function showList() {
    page.replaceChildren();
    const controls = toolbar();
    controls.append(raidElement('h3', 'Meeting records'), button('+ New meeting', () => schedule(), 'raid-primary'));
    page.append(controls);
    const now = new Date().toISOString();
    for (const [heading, upcoming] of [['Upcoming', true], ['Past meetings', false]]) {
      const rows = meetings.filter(meeting => (meeting.ends_at >= now) === upcoming)
        .sort((a,b) => upcoming ? a.starts_at.localeCompare(b.starts_at) : b.starts_at.localeCompare(a.starts_at));
      if (!rows.length && !upcoming) continue;
      const group = raidElement('section', null, 'meeting-list');
      group.append(raidElement('h4', heading));
      if (!rows.length) group.append(raidElement('p', 'No upcoming meetings.'));
      for (const meeting of rows) {
        const row = button('', () => open(meeting), 'meeting-row');
        row.append(raidElement('strong', meeting.title), raidElement('small', raidDate(meeting.starts_at)));
        group.append(row);
      }
      page.append(group);
    }
  }

  function schedule(meeting) {
    const modal = raidElement('dialog', null, 'meeting-dialog');
    const form = raidElement('form', null, 'raid-form');
    const title = recordField(form,'title','Meeting title','text',120);
    const dates = raidElement('div', null, 'meeting-dates');
    const start = recordField(dates,'start','Starts (local time)','datetime-local');
    const end = recordField(dates,'end','Ends (local time)','datetime-local');
    form.append(dates);
    const location = recordField(form,'location','Location or voice channel','text',250);
    title.required = start.required = end.required = true;
    const local = date => new Date(+date - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
    if (meeting) {
      title.value = meeting.title;
      start.value = local(new Date(meeting.starts_at));
      end.value = local(new Date(meeting.ends_at));
      location.value = meeting.location;
    }
    start.addEventListener('change', () => {
      const time = new Date(start.value);
      if (Number.isFinite(+time) && (!end.value || new Date(end.value) <= time)) {
        end.value = local(new Date(+time + 30 * 60000));
      }
    });
    const controls = toolbar();
    const submit = raidElement('button', meeting ? 'Save details' : 'Create meeting', 'raid-primary');
    controls.append(button('Cancel', () => modal.close()), submit);
    const status = raidElement('p');
    status.setAttribute('role', 'status');
    form.append(controls, status);
    modal.append(raidElement('h3', meeting ? 'Edit meeting details' : 'New meeting'), form);
    modal.addEventListener('close', () => modal.remove(), { once:true });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      submit.disabled = true;
      try {
        const starts_at = new Date(start.value).toISOString(), ends_at = new Date(end.value).toISOString();
        const result = await recordRequest(path, { id: meeting?.id, revision: meeting?.revision,
          title:title.value, start:starts_at, end:ends_at, location:location.value, agenda:meeting?.agenda, notes:meeting?.notes });
        if (!current()) return;
        const saved = { ...meeting, id:result.id, title:title.value.trim(), starts_at, ends_at, location:location.value.trim(),
          agenda:meeting?.agenda ?? '', notes:meeting?.notes ?? '', revision:(meeting?.revision ?? 0)+1, editable:true };
        const index = meetings.findIndex(row => row.id === saved.id);
        if (index < 0) meetings.push(saved);
        else meetings[index] = saved;
        modal.close();
        open(saved);
      } catch (error) { status.textContent = error.message; }
      finally { submit.disabled = false; }
    });
    page.append(modal);
    modal.showModal();
  }

  function open(meeting) {
    page.replaceChildren();
    const controls = toolbar();
    const doc = raidElement('div', null, 'meeting-document');
    const status = raidElement('span');
    status.setAttribute('role','status');
    let dirty = false;
    let saving = false;
    const leave = () => !saving && (!dirty || confirm('Leave without saving your notes?'));
    controls.append(button('← Meetings', () => { if (leave()) showList(); }));
    const actions = toolbar();
    if (meeting.editable) actions.append(button('Edit details', () => { if (leave()) schedule(meeting); }));
    controls.append(actions);
    const title = raidElement('h3', meeting.title, 'meeting-title');
    const meta = raidElement('p', [raidDate(meeting.starts_at) + ' – ' + raidDate(meeting.ends_at), meeting.location].filter(Boolean).join(' · '));
    page.append(controls, title, meta);
    doc.setAttribute('aria-label','Meeting document');
    if (meeting.notes.startsWith(prefix)) doc.append(documentContent(meeting.notes.slice(prefix.length)));
    else {
      for (const [heading, value] of [['Agenda',meeting.agenda],['Notes',meeting.notes],['Decisions',''],['Action items','']]) {
        doc.append(raidElement('h4', heading));
        const block = raidElement('p', value);
        if (!value) block.append(document.createElement('br'));
        doc.append(block);
      }
    }
    if (meeting.editable) {
      doc.contentEditable = 'true';
      doc.setAttribute('role','textbox');
      doc.setAttribute('aria-multiline','true');
      const tools = toolbar();
      tools.classList.add('meeting-format');
      function changed() { dirty = true; status.textContent = 'Unsaved changes'; }
      let range;
      doc.addEventListener('blur', () => {
        const selection = getSelection();
        if (selection.rangeCount && doc.contains(selection.getRangeAt(0).commonAncestorContainer)) range = selection.getRangeAt(0).cloneRange();
      });
      const command = (name, type, value) => {
        const control = button(name, () => {
          doc.focus();
          if (range && doc.contains(range.commonAncestorContainer)) {
            const selection = getSelection();
            selection.removeAllRanges(); selection.addRange(range);
          }
          document.execCommand(type, false, value);
          range = undefined;
          changed();
        });
        tools.append(control);
      };
      command('Heading', 'formatBlock', 'h4');
      command('Text', 'formatBlock', 'p');
      command('Bold', 'bold');
      command('Bullets', 'insertUnorderedList');
      command('Checklist', 'insertHTML', '<ul><li data-task="true" data-done="false">Task</li></ul><p><br></p>');
      doc.addEventListener('input', changed);
      doc.addEventListener('drop', event => event.preventDefault());
      doc.addEventListener('paste', event => {
        event.preventDefault();
        document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
      });
      doc.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || !event.altKey) return;
        const anchor = getSelection().anchorNode;
        const task = (anchor?.parentElement)?.closest('li[data-task]');
        if (!task || !doc.contains(task)) return;
        event.preventDefault();
        task.dataset.done = String(task.dataset.done !== 'true');
        changed();
      });
      doc.addEventListener('click', event => {
        const task = event.target.closest('li[data-task]');
        if (task && event.clientX - task.getBoundingClientRect().left < 26) {
          task.dataset.done = String(task.dataset.done !== 'true');
          changed();
        }
      });
      const save = button('Save notes', async () => {
        saving = save.disabled = true;
        status.textContent = 'Saving…';
        const raw = doc.innerHTML;
        const safe = document.createElement('div');
        safe.append(documentContent(raw));
        const notes = prefix + safe.innerHTML;
        try {
          if (notes.length > 16000) throw new Error('This document exceeds the 16,000-character storage limit.');
          await recordRequest(path, { id:meeting.id, revision:meeting.revision, title:meeting.title, start:meeting.starts_at,
            end:meeting.ends_at, location:meeting.location, agenda:meeting.agenda, notes });
          meeting.notes = notes;
          meeting.revision++;
          dirty = doc.innerHTML !== raw;
          status.textContent = dirty ? 'Unsaved changes' : 'Saved';
        } catch (error) { status.textContent = error.message; }
        finally { saving = save.disabled = false; }
      }, 'raid-primary');
      actions.append(save);
      page.append(tools);
    }
    page.append(doc, status);
    if (!meeting.editable) status.textContent = 'Read only';
  }
  showList();
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
