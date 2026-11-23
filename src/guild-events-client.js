import { tablerIcon } from '../public/assets/icons.js';
import { createSchedulePicker } from './schedule-picker.js';

export function renderGuildEvents(root, { eventTypes, raidInstances, request, createRaid, openRaid, agendaOnly = false, limit = Infinity, onViewAll }) {
  const make = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const button = (text, action, label) => {
    const element = make('button',text);
    if (['←','→'].includes(text)) element.replaceChildren(tablerIcon(text === '←' ? 'arrow-left' : 'arrow-right'));
    element.type = 'button';
    if (label) element.setAttribute('aria-label',label);
    element.addEventListener('click',action);
    return element;
  };
  const dayAt = date => new Date(date.getFullYear(),date.getMonth(),date.getDate());
  const addDays = (date, offset) => new Date(date.getFullYear(),date.getMonth(),date.getDate()+offset);
  const monthAt = (date, offset = 0) => new Date(date.getFullYear(),date.getMonth()+offset,1);
  let today = dayAt(new Date());
  let month = monthAt(today);
  let selected = null;
  let agendaEvents = [];
  let monthEvents = [];
  let loading = true;
  let agendaLoaded = false;
  let revision = 0;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dayLabel = new Intl.DateTimeFormat(undefined,{weekday:'long',day:'numeric',month:'long'});
  const monthLabel = new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'});
  const timeLabel = new Intl.DateTimeFormat(undefined,{timeStyle:'short'});
  const dot = type => {
    const element = make('span',undefined,'guild-event-dot');
    element.style.backgroundColor = eventTypes[type];
    element.setAttribute('aria-hidden','true');
    return element;
  };

  const layout = make('div',undefined,'guild-events-layout');
  const agenda = make('section',undefined,'raid-card guild-events-agenda');
  const agendaHead = make('header',undefined,'guild-events-agenda-head');
  const heading = make('h3','Upcoming Events');
  const viewAll = button('View all',()=>{if(onViewAll){onViewAll();return;}selected=null;drawAgenda();drawCalendar();},'View all upcoming events');
  agendaHead.append(heading,viewAll);
  const weekStrip = make('div',undefined,'guild-agenda-week');
  weekStrip.setAttribute('role','group');weekStrip.setAttribute('aria-label','Choose an agenda day');
  const timezone = make('p','Times in '+zone,'guild-events-zone guild-agenda-timezone');
  const rows = make('div');
  const status = make('p',undefined,'guild-events-status');
  status.setAttribute('role','status');
  agenda.append(agendaHead,weekStrip,status,rows,timezone);

  const side = make('aside',undefined,'guild-events-sidebar');
  const calendar = make('section',undefined,'raid-card guild-events-calendar');
  calendar.setAttribute('aria-label','Events calendar');
  const nav = make('div',undefined,'raid-calendar-month');
  const monthTitle = make('strong',undefined,'guild-calendar-month-title');
  monthTitle.setAttribute('aria-live','polite');
  function shift(offset) {
    month = monthAt(month,offset);
    selected = null;
    load(false);
  }
  const monthActions = make('div',undefined,'guild-calendar-controls');
  monthActions.append(button('←',()=>shift(-1),'Previous month'),button('Today',()=>{
    month = monthAt(new Date()); selected = null; load(false);
  },'Show current month'),button('→',()=>shift(1),'Next month'));
  nav.append(monthTitle,monthActions);
  const weekdays = make('div',undefined,'raid-calendar-week');
  for (let index = 0; index < 7; index++) {
    const date = new Date(2024,0,1+index);
    const weekday = make('span',new Intl.DateTimeFormat(undefined,{weekday:'short'}).format(date));
    weekday.title = new Intl.DateTimeFormat(undefined,{weekday:'long'}).format(date);
    weekdays.append(weekday);
  }
  const days = make('div',undefined,'raid-calendar-days');
  const legend = make('div',undefined,'guild-events-legend');
  for (const type of Object.keys(eventTypes)) {
    const key = make('span');
    key.append(dot(type),type);
    legend.append(key);
  }
  calendar.append(nav,weekdays,days,legend);

  const form = make('form',undefined,'raid-card guild-events-plan');
  form.id = 'planGuildEvent';
  form.hidden = true;
  const formHeading = make('header',undefined,'guild-events-plan-head');
  const closeForm = button('',()=>{form.hidden=true;document.getElementById('newRaid')?.focus();},'Close event form');
  closeForm.append(tablerIcon('x'));
  formHeading.append(make('h3','Plan an Event'),closeForm);
  form.append(formHeading);
  function field(caption, control) {
    const label = make('label',caption);
    label.append(control);
    return label;
  }
  const title = make('input');
  title.required = true;
  title.maxLength = 80;
  title.placeholder = 'Deadmines run';
  const types = make('fieldset',undefined,'guild-event-types');
  types.append(make('legend','Type'));
  const choices = make('div',undefined,'guild-event-type-choices');
  const raid = make('select');
  raid.append(new Option('Choose a raid',''));
  for (const [key, instance] of Object.entries(raidInstances)) raid.append(new Option(instance.name,key));
  const raidField = field('Raid instance',raid);
  raidField.hidden = true;
  for (const type of Object.keys(eventTypes)) {
    const label = make('label');
    const radio = make('input');
    radio.type = 'radio';
    radio.name = 'eventType';
    radio.value = type;
    radio.defaultChecked = type === 'Dungeon';
    radio.addEventListener('change',updateType);
    const chip = make('span');
    chip.append(dot(type),type);
    label.append(radio,chip);
    choices.append(label);
  }
  types.append(choices);
  function updateType() {
    const isRaid = form.elements.eventType.value === 'Raid';
    raidField.hidden = !isRaid;
    raid.required = isRaid;
    title.required = !isRaid;
    title.placeholder = isRaid ? 'Defaults to the raid name' : 'Deadmines run';
  }
  const start = createSchedulePicker({label:'Start'});
  const localTime = make('p','Your local time · '+zone,'guild-events-zone');
  const repeat = make('select');
  repeat.append(new Option('Does not repeat','1'),new Option('Weekly','weekly'));
  const weeks = make('input');
  weeks.type = 'number';
  weeks.min = '2';
  weeks.max = '12';
  weeks.defaultValue = '2';
  const weeksField = field('Number of weekly occurrences',weeks);
  function updateRepeat() {
    weeksField.hidden = repeat.value !== 'weekly';
    weeks.required = !weeksField.hidden;
    weeks.disabled = weeksField.hidden;
  }
  repeat.addEventListener('change',updateRepeat);
  const details = make('details');
  const end = createSchedulePicker({label:'End',optional:true});
  const description = make('textarea');
  description.maxLength = 1000;
  description.rows = 3;
  details.append(make('summary','End time and description'),end.element,field('Description',description));
  const submit = make('button','Create Event','raid-primary');
  const formStatus = make('p',undefined,'guild-events-status');
  formStatus.setAttribute('role','status');
  form.append(field('Title',title),types,raidField,start.element,localTime,
    field('Repeat',repeat),weeksField,details,submit,formStatus);
  updateRepeat();
  side.append(agenda,form);
  layout.append(calendar,side);
  root.replaceChildren(agendaOnly ? agenda : layout);

  form.addEventListener('submit',async event => {
    event.preventDefault();
    if (form.elements.eventType.value !== 'Raid' && !title.value.trim()) {
      formStatus.textContent = 'Enter an event title.';
      title.focus();
      return;
    }
    const first = start.value();
    const last = end.value();
    if (!first || +first <= Date.now()) {
      formStatus.textContent = start.hasDate() ? 'Choose a valid future start time.' : 'Choose a start date.';
      start.focus();
      return;
    }
    if (end.hasDate() && (!last || +last <= +first)) {
      formStatus.textContent = last ? 'End time must be after the start.' : 'Choose a valid end time.';
      details.open = true;
      end.focus();
      return;
    }
    const type = form.elements.eventType.value;
    const input = {
      type, title: title.value, startsAt: first.toISOString(), endsAt: last?.toISOString() ?? null,
      description: description.value,
      dates: Array.from({length: repeat.value === 'weekly' ? Number(weeks.value) : 1},
        (_, index) => index === 0 ? first.toISOString() : addDaysKeepingTime(first,index * 7)),
    };
    submit.disabled = true;
    formStatus.textContent = '';
    try {
      const result = type === 'Raid'
        ? await createRaid({...input, instance:raid.value, size:raidInstances[raid.value].size, notes:input.description, fromEvents:true})
        : await request('',input);
      form.reset();
      start.reset();
      end.reset();
      updateType();
      updateRepeat();
      details.open = false;
      month = monthAt(first);
      selected = first >= addDays(dayAt(new Date()),91) ? +dayAt(first) : null;
      formStatus.textContent = result.count === 1 ? 'Event created.' : result.count+' events created.';
      await load(true);
    } catch (error) {
      formStatus.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  function addDaysKeepingTime(date, offset) {
    const next = new Date(date);
    next.setDate(next.getDate()+offset);
    return next.toISOString();
  }

  function groupsFor(events) {
    const groups = new Map();
    for (const event of [...events].sort((a,b) => a.starts_at.localeCompare(b.starts_at))) {
      const key = +dayAt(new Date(event.starts_at));
      if (!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(event);
    }
    return groups;
  }

  heading.tabIndex = -1;
  function drawAgenda() {
    heading.textContent = 'Upcoming Events';
    rows.replaceChildren();
    weekStrip.replaceChildren();
    const activeDay = selected === null ? today : new Date(selected);
    const monday = addDays(activeDay,-((activeDay.getDay()+6)%7));
    for (let index=0;index<7;index++) {
      const date=addDays(monday,index);
      const dayButton=button('',()=>{selected=+date;drawAgenda();drawCalendar();},dayLabel.format(date));
      dayButton.setAttribute('aria-pressed',String(+date===+activeDay));
      dayButton.append(make('strong',String(date.getDate()).padStart(2,'0')),make('small',new Intl.DateTimeFormat(undefined,{weekday:'short'}).format(date)));
      weekStrip.append(dayButton);
    }
    if (loading) return;
    const available = selected === null ? agendaEvents.filter(event => Date.parse(event.starts_at) >= +today)
      : monthEvents.filter(event => +dayAt(new Date(event.starts_at)) === selected);
    const events = [...available].sort((a,b)=>a.starts_at.localeCompare(b.starts_at)).slice(0,limit);
    for (const [day, items] of groupsFor(events)) {
      const section = make('section',undefined,'guild-events-day');
      if (selected === null) section.append(make('h4',(day === +today ? 'Today · ' : '')+dayLabel.format(new Date(day))));
      for (const event of items) {
        const time = make('time',undefined,'guild-event-time');
        const range = timeLabel.format(new Date(event.starts_at))+(event.ends_at ? ' – '+timeLabel.format(new Date(event.ends_at)) : '');
        time.append(tablerIcon('clock'),range);
        time.dateTime = event.starts_at;
        if (event.ends_at) time.title = 'Ends '+timeLabel.format(new Date(event.ends_at));
        const name = make('div',undefined,'guild-event-copy');
        const type = make('small',event.type);
        type.style.color = eventTypes[event.type];
        name.append(make('strong',event.title));
        const metadata=make('div',undefined,'guild-event-meta');
        metadata.append(type,make('small','Created by '+(event.created_by || 'Unknown'),'guild-event-creator'));
        name.append(metadata);
        if (event.description) name.append(make('p',event.description,'guild-event-description'));
        const count = make('small',event.signups ? event.signups+' signed up' : 'No sign-ups yet','guild-event-count');
        const action = event.type === 'Raid'
          ? button(event.state === 'Open' ? 'Sign up' : 'View raid',()=>openRaid(event.id))
          : Date.parse(event.starts_at) > Date.now() ? button(event.joined ? 'Leave' : 'Sign up',async () => {
              action.disabled = true;
              status.textContent = '';
              try {
                const result = await request('',{action:'signup',id:event.id,joined:!event.joined});
                for (const item of [...agendaEvents,...monthEvents].filter(item => item.id === event.id)) Object.assign(item,result);
                action.textContent = result.joined ? 'Leave' : 'Sign up';
                count.textContent = result.signups ? result.signups+' signed up' : 'No sign-ups yet';
              } catch (error) {
                status.textContent = error.message;
              } finally {
                action.disabled = false;
              }
            }) : null;
        const row = make('article',undefined,'guild-event-row');
        row.style.setProperty('--event-color',eventTypes[event.type]);
        const main=make('div',undefined,'guild-event-main');
        main.append(name,time);
        const footer=make('div',undefined,'guild-event-footer');
        footer.append(count);
        row.append(main,footer);
        const actions = make('div',undefined,'guild-event-actions');
        if (action) actions.append(action);
        if (!agendaOnly && event.organizer) {
          const remove = button('Delete event',async () => {
            if (!window.confirm('Delete “'+event.title+'” and its sign-ups for this occurrence?')) return;
            remove.disabled = true;
            if (action) action.disabled = true;
            status.textContent = '';
            try {
              await request('',{action:'delete',id:event.id});
              agendaEvents = agendaEvents.filter(item => item.id !== event.id);
              monthEvents = monthEvents.filter(item => item.id !== event.id);
              drawAgenda();
              drawCalendar();
              heading.focus();
              await load(true);
              if (!status.textContent) status.textContent = 'Event deleted.';
            } catch (error) {
              status.textContent = error.message;
            } finally {
              remove.disabled = false;
              if (action) action.disabled = false;
            }
          },'Delete '+event.title);
          remove.className = 'raid-control-danger';
          actions.append(remove);
        }
        if (actions.childNodes.length) footer.append(actions);
        section.append(row);
      }
      rows.append(section);
    }
    if (!events.length && !status.textContent) rows.append(make('p',selected === null ? 'No upcoming events.' : 'No events scheduled for this date.'));
  }

  function firstVisibleDay() {
    return addDays(month,-((month.getDay()+6)%7));
  }
  function drawCalendar() {
    monthTitle.replaceChildren(tablerIcon('calendar-event'),document.createTextNode(monthLabel.format(month)));
    days.replaceChildren();
    const first = firstVisibleDay();
    const groups = groupsFor(monthEvents);
    for (let index = 0; index < 42; index++) {
      const date = addDays(first,index);
      const events = groups.get(+date) ?? [];
      const day = button(String(date.getDate()),() => {
        selected = selected === +date ? null : +date;
        drawAgenda();
        drawCalendar();
        days.children[index].focus();
      },dayLabel.format(date)+(events.length ? ', '+events.map(event => event.title).join(', ') : ''));
      day.replaceChildren(make('span',String(date.getDate()),'guild-calendar-date'));
      day.classList.toggle('outside-month',date.getMonth() !== month.getMonth());
      day.setAttribute('aria-pressed',String(+date === selected));
      if (+date === +today) day.setAttribute('aria-current','date');
      const previews = make('span',undefined,'guild-calendar-previews');
      for (const event of events.slice(0,2)) {
        const preview = make('span',event.title,'guild-calendar-preview');
        preview.style.setProperty('--event-color',eventTypes[event.type]);
        previews.append(preview);
      }
      if (events.length > 2) previews.append(make('span','+'+(events.length-2)+' more','guild-calendar-more'));
      day.append(previews);
      days.append(day);
    }
  }

  async function load(refreshAgenda) {
    const current = ++revision;
    today = dayAt(new Date());
    if (refreshAgenda) agendaLoaded = false;
    const fetchRange = async (from, to) => {
      const query = new URLSearchParams({from:from.toISOString(),to:to.toISOString()});
      return (await request('?'+query)).events;
    };
    const first = firstVisibleDay();
    const endOfCalendar = addDays(first,42);
    drawCalendar();
    status.textContent = 'Loading events…';
    const [nextMonth,nextAgenda] = await Promise.allSettled([
      fetchRange(first,endOfCalendar),
      agendaLoaded ? agendaEvents : fetchRange(today,addDays(today,91)),
    ]);
    if (current !== revision) return;
    if (nextMonth.status === 'fulfilled') monthEvents = nextMonth.value;
    if (nextAgenda.status === 'fulfilled') {
      agendaEvents = nextAgenda.value;
      agendaLoaded = true;
    }
    const failure = [nextMonth,nextAgenda].find(result => result.status === 'rejected');
    status.textContent = '';
    if (failure) {
      status.append(failure.reason.message+' ',button('Retry',()=>load(true)));
    }
    loading = false;
    drawCalendar();
    drawAgenda();
  }
  load(true);
}
