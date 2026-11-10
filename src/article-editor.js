// Rebuild a small set of tags. Everything else is rendered as text.
export function articleMarkup(body, format, escape) {
  if (format !== 'rich') {
    return body.split(/\r?\n\s*\r?\n/).map(paragraph => '<p>' + escape(paragraph) + '</p>').join('');
  }
  const tokens = /<\/?(?:p|div|h2|h3|b|strong|i|em|ul|ol|li|blockquote)>|<br\s*\/?>|<img src="([^"<>]*)" alt="([^"<>]*)"\s*\/?>|&(?:amp|lt|gt|quot|#39|nbsp);/gi;
  let output = '';
  let offset = 0;
  for (const match of body.matchAll(tokens)) {
    output += escape(body.slice(offset, match.index));
    offset = match.index + match[0].length;
    if (match[1] === undefined) {
      output += match[0];
      continue;
    }
    try {
      const source = new URL(match[1].replaceAll('&amp;', '&'));
      if (source.protocol === 'https:' && !source.username && !source.password) {
        const alt = match[2].replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, key) =>
          ({ amp:'&', lt:'<', gt:'>', quot:'"', '#39':"'", nbsp:' ' })[key]);
        output += '<img src="' + escape(source.href) + '" alt="' + escape(alt) + '" loading="lazy" referrerpolicy="no-referrer">';
      }
    } catch { /* Ignore invalid image URLs. */ }
  }
  return output + escape(body.slice(offset));
}

export function startArticleEditor() {
  const editor = document.getElementById('articleContent');
  const body = document.getElementById('articleBody');
  const toolbar = document.getElementById('articleTools');
  editor.hidden = false;
  toolbar.hidden = false;
  body.hidden = true;
  body.required = false;
  body.form.elements.body_format.value = 'rich';

  let selection;
  document.addEventListener('selectionchange', () => {
    const current = window.getSelection();
    if (current.rangeCount && editor.contains(current.getRangeAt(0).commonAncestorContainer)) {
      selection = current.getRangeAt(0).cloneRange();
    }
  });
  toolbar.addEventListener('click', event => {
    const button = event.target.closest('button[data-command]');
    if (!button) return;
    const command = button.dataset.command;
    let value = button.dataset.value;
    if (command === 'image') {
      const url = window.prompt('Image URL (HTTPS)');
      if (!url) return;
      let source;
      try { source = new URL(url); } catch {}
      if (source?.protocol !== 'https:' || source.username || source.password) {
        window.alert('Enter a valid HTTPS image URL.');
        return;
      }
      const alt = window.prompt('Describe the image for readers using screen readers.');
      if (alt === null) return;
      const image = document.createElement('img');
      image.setAttribute('src', source.href);
      image.setAttribute('alt', alt);
      value = image.outerHTML;
    }
    editor.focus();
    if (selection && editor.contains(selection.commonAncestorContainer)) {
      const current = window.getSelection();
      current.removeAllRanges();
      current.addRange(selection);
    }
    document.execCommand(command === 'image' ? 'insertHTML' : command, false, value);
  });
  editor.addEventListener('paste', event => {
    event.preventDefault();
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
  });
  editor.addEventListener('drop', event => event.preventDefault());
  body.form.addEventListener('submit', event => {
    if (!editor.textContent.trim() && !editor.querySelector('img')) {
      event.preventDefault();
      editor.focus();
      return;
    }
    // Serialize only image attributes that the server accepts.
    const copy = editor.cloneNode(true);
    for (const image of copy.querySelectorAll('img')) {
      const clean = document.createElement('img');
      clean.setAttribute('src', image.getAttribute('src') ?? '');
      clean.setAttribute('alt', image.getAttribute('alt') ?? '');
      image.replaceWith(clean);
    }
    const markup = copy.innerHTML;
    if (markup.length > body.maxLength) {
      event.preventDefault();
      window.alert('This article exceeds the editor length limit.');
      return;
    }
    body.value = markup;
  });
}
