import { tablerIcon } from '../public/assets/icons.js';
export function createSchedulePicker({ label, optional = false }) {
  function make(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(text, action, ariaLabel) {
    const node = make('button',text);
    if (['‹','›'].includes(text)) node.replaceChildren(tablerIcon(text === '‹' ? 'chevron-left' : 'chevron-right'));
    node.type = 'button';
    if (ariaLabel) node.setAttribute('aria-label',ariaLabel);
    node.addEventListener('click',action);
    return node;
  }
  const dayLabel = new Intl.DateTimeFormat(undefined,{dateStyle:'full'});
  const monthLabel = new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'});
  const localDay = date => new Date(date.getFullYear(),date.getMonth(),date.getDate());
  const monthOf = (date, offset = 0) => new Date(date.getFullYear(),date.getMonth()+offset,1);
  let selectedDay;
  let month;
  const element = make('div',null,'raid-schedule');
  const dateField = make('fieldset',null,'raid-date-field');
  const picker = make('details');
  const summary = make('summary','Choose a date','raid-selected-date');
  const calendar = make('div',null,'raid-calendar');
  const navigation = make('div',null,'raid-calendar-month');
  const monthTitle = make('strong');
  monthTitle.setAttribute('aria-live','polite');
  const previous = button('‹',()=>shift(-1),'Previous month');
  const next = button('›',()=>shift(1),'Next month');
  navigation.append(previous,monthTitle,next);
  const weekdays = make('div',null,'raid-calendar-week');
  weekdays.setAttribute('aria-hidden','true');
  for (const name of ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']) weekdays.append(make('span',name));
  const days = make('div',null,'raid-calendar-days');
  calendar.append(navigation,weekdays,days);
  picker.append(summary,calendar);
  dateField.append(make('legend',label+' date'),picker);
  const timeField = make('fieldset',null,'raid-time-field');
  const controls = make('div',null,'raid-time-controls');
  const hour = make('select');
  hour.setAttribute('aria-label','Hour');
  for (let value = 1; value <= 12; value++) hour.add(new Option(value,value,value === 7,value === 7));
  const separator = make('span',':');
  separator.setAttribute('aria-hidden','true');
  const minute = make('input');
  Object.assign(minute,{type:'number',min:'0',max:'59',defaultValue:'00',required:true});
  minute.setAttribute('aria-label','Minute');
  const period = make('select');
  period.setAttribute('aria-label','AM or PM');
  period.append(new Option('AM'),new Option('PM','PM',true,true));
  controls.append(hour,separator,minute,period);
  timeField.append(make('legend',label+' time'),controls);
  timeField.disabled = optional;
  element.append(dateField,timeField);
  const clear = optional ? button('Clear date',()=>{
    reset();
    summary.focus();
  }) : null;
  if (clear) {
    clear.hidden = true;
    clear.className = 'raid-clear-date';
    calendar.append(clear);
  }

  function shift(offset) {
    month = monthOf(month,offset);
    draw();
    if (previous.disabled) next.focus();
  }
  function draw() {
    const today = localDay(new Date());
    monthTitle.textContent = monthLabel.format(month);
    previous.disabled = month <= monthOf(today);
    days.replaceChildren();
    for (let gap = 0; gap < month.getDay(); gap++) days.append(make('span'));
    const last = new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
    for (let day = 1; day <= last; day++) {
      const date = new Date(month.getFullYear(),month.getMonth(),day);
      const cell = button(day,()=>{
        selectedDay = date;
        summary.textContent = dayLabel.format(date);
        timeField.disabled = false;
        if (clear) clear.hidden = false;
        picker.open = false;
        summary.focus();
      },dayLabel.format(date));
      cell.disabled = date < today;
      cell.setAttribute('aria-pressed',String(+date === +selectedDay));
      if (+date === +today) cell.setAttribute('aria-current','date');
      days.append(cell);
    }
  }
  picker.addEventListener('toggle',()=>{
    if (!picker.open) return;
    month = monthOf(selectedDay ?? new Date());
    draw();
  });

  function reset() {
    selectedDay = undefined;
    summary.textContent = 'Choose a date';
    picker.open = false;
    timeField.disabled = optional;
    if (clear) clear.hidden = true;
  }
  function value() {
    if (!selectedDay || !minute.checkValidity()) return null;
    const hours = Number(hour.value)%12 + (period.value === 'PM' ? 12 : 0);
    const minutes = Number(minute.value);
    const date = new Date(selectedDay);
    date.setHours(hours,minutes,0,0);
    return date.getHours() === hours && date.getMinutes() === minutes ? date : null;
  }
  function focus() {
    if (selectedDay) hour.focus();
    else {
      picker.open = true;
      summary.focus();
    }
  }
  return { element, value, focus, reset, hasDate: () => Boolean(selectedDay) };
}
