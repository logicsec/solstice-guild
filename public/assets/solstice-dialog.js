export function showSolsticeDialog({
  title, message, confirmLabel, cancelLabel = 'Cancel', danger = false, fields = [], validate,
}) {
  if (document.querySelector('.solstice-dialog')) return Promise.resolve(null);

  const make = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const dialog = make('dialog', null, 'solstice-dialog');
  dialog.setAttribute('aria-labelledby', 'solstice-dialog-title');
  const heading = make('h2', title);
  heading.id = 'solstice-dialog-title';
  const form = make('form');
  form.method = 'dialog';
  form.noValidate = true;
  form.append(heading);
  if (message) {
    const description = make('p', message);
    description.id = 'solstice-dialog-description';
    dialog.setAttribute('aria-describedby', description.id);
    form.append(description);
  }

  const inputs = new Map();
  for (const {name,label,type='text'} of fields) {
    const field = make('label', label);
    const input = make('input');
    input.type = type;
    input.autofocus = inputs.size === 0;
    inputs.set(name, input);
    field.append(input);
    form.append(field);
  }
  const error = make('p', null, 'solstice-dialog-error');
  error.setAttribute('role', 'alert');
  if (fields.length) form.append(error);

  const actions = make('div', null, 'solstice-dialog-actions');
  if (cancelLabel) {
    const cancel = make('button', cancelLabel, 'solstice-dialog-cancel');
    cancel.type = 'button';
    cancel.autofocus = !fields.length;
    cancel.addEventListener('click', () => dialog.close());
    actions.append(cancel);
  }
  const confirm = make('button', confirmLabel, 'solstice-dialog-confirm');
  confirm.type = 'submit';
  confirm.autofocus = !cancelLabel && !fields.length;
  if (danger) confirm.classList.add('solstice-dialog-danger');
  actions.append(confirm);
  form.append(actions);
  dialog.append(form);

  return new Promise(resolve => {
    let result = null;
    form.addEventListener('submit', event => {
      event.preventDefault();
      const values = Object.fromEntries([...inputs].map(([name,input])=>[name,input.value]));
      const message = validate?.(values);
      if (message) {
        error.textContent = message;
        inputs.values().next().value?.focus();
        return;
      }
      result = values;
      dialog.close();
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    }, {once:true});
    document.body.append(dialog);
    dialog.showModal();
  });
}
