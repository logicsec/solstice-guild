export async function renderCraftingDirectory(root, isCurrent, professions) {
  const panel = raidElement('section', null, 'raid-card');
  const status = raidElement('p', 'Loading crafting directory…');
  status.setAttribute('role', 'status');
  panel.append(status);
  root.append(panel);
  const search = raidElement('input');
  search.type = 'search';
  search.placeholder = 'Search recipes, items, or crafters';
  search.setAttribute('aria-label', 'Search crafting directory');
  const filter = raidElement('select');
  filter.setAttribute('aria-label', 'Filter by profession');
  filter.append(new Option('All professions', ''), ...professions.map(name => new Option(name)));
  const controls = raidElement('div', null, 'raid-actions');
  controls.append(search, filter);
  const results = raidElement('div');
  const setup = raidElement('details', null, 'raid-card');
  setup.append(raidElement('summary', 'Confirm a recipe'));
  panel.append(controls, setup, results);
  let data;
  async function loadDirectory() {
    data = await guildRequest('/api/crafting-directory');
    if (!isCurrent()) return;
    status.textContent = 'Recipes confirmed by guild members.';
    renderResults();
  }

  function renderResults() {
    const term = search.value.trim().toLowerCase();
    const groups = new Map();
    for (const row of data.listings) {
      if (filter.value && filter.value !== row.profession) continue;
      if (term && ![row.recipe_name,row.result_name,row.character].some(text => text.toLowerCase().includes(term))) continue;
      const key = row.profession + ':' + row.spell_id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    results.replaceChildren();
    if (!groups.size) results.append(raidElement('p', 'No confirmed recipes match. Use Confirm a recipe to add one.'));
    for (const rows of groups.values()) {
      const recipe = rows[0];
      const card = raidElement('details', null, 'raid-card');
      const name = recipe.recipe_name === recipe.result_name || !recipe.result_name
        ? recipe.recipe_name : recipe.recipe_name + ' → ' + recipe.result_name;
      card.append(raidElement('summary', name + ' · ' + recipe.profession + ' · ' + rows.length + (rows.length === 1 ? ' crafter' : ' crafters')));
      if (recipe.materials.length) {
        const materials = recipe.materials.map(item => item.qty + ' × ' + item.name);
        card.append(raidElement('p', materials.join(' · ')));
        const copy = raidElement('button', 'Copy Materials List');
        copy.addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(materials.join('\n')); copy.textContent = 'Copied'; }
          catch { status.textContent = 'Could not copy the materials list.'; }
        });
        card.append(copy);
      }
      for (const row of rows) {
        const crafter = raidElement('div', null, 'raid-row');
        const identity = raidElement('div');
        identity.append(raidElement('strong', row.character), raidElement('p', 'Confirmed ' + new Date(row.confirmed_at).toLocaleDateString()));
        if (row.note) identity.append(raidElement('p', row.note));
        crafter.append(identity);
        if (row.mine) {
          const remove = raidElement('button', 'Remove confirmation');
          remove.addEventListener('click', async () => {
            remove.disabled = true;
            try {
              await guildRequest('/api/crafting-directory', { action:'remove', character:row.character, profession:row.profession, spellId:row.spell_id });
              await loadDirectory();
            } catch (error) { status.textContent = error.message; remove.disabled = false; }
          });
          crafter.append(remove);
        }
        card.append(crafter);
      }
      results.append(card);
    }
  }

  await loadDirectory();
  if (!isCurrent()) return;
  search.addEventListener('input', renderResults);
  filter.addEventListener('change', renderResults);
  if (!data.characters.length) {
    setup.append(raidElement('p', 'Add a character under My Characters before confirming recipes.'));
    return;
  }
  const form = raidElement('form', null, 'raid-form');
  function field(title, control) {
    const label = raidElement('label', title);
    label.append(control);
    form.append(label);
    return control;
  }
  const character = field('Character', raidElement('select'));
  character.append(...data.characters.map(name => new Option(name)));
  const profession = field('Profession', raidElement('select'));
  profession.append(new Option('Choose a profession', ''), ...professions.map(name => new Option(name)));
  const recipeSearch = field('Find a recipe', raidElement('input'));
  recipeSearch.type = 'search';
  const recipes = field('Recipe', raidElement('select'));
  const note = field('Crafter note (optional)', raidElement('input'));
  note.maxLength = 240;
  note.placeholder = 'Bring mats, no tip needed';
  const submit = raidElement('button', 'I Know This Recipe', 'raid-primary');
  submit.type = 'submit';
  submit.disabled = true;
  form.append(submit);
  setup.append(form);
  let catalog = [];
  let revision = 0;
  function fillRecipes() {
    const term = recipeSearch.value.trim().toLowerCase();
    const matches = catalog.filter(row => [row.recipe.name, row.result?.name].some(name => name?.toLowerCase().includes(term)));
    recipes.replaceChildren(new Option('Choose a recipe', ''), ...matches.map(row => new Option(
      row.result?.name && row.result.name !== row.recipe.name ? row.recipe.name + ' → ' + row.result.name : row.recipe.name,
      row.recipe.spellId)));
    submit.disabled = true;
  }
  profession.addEventListener('change', async () => {
    const current = ++revision;
    catalog = [];
    fillRecipes();
    if (!profession.value) return;
    recipes.options[0].text = 'Loading recipes…';
    try {
      const response = await fetch('/crafting/' + encodeURIComponent(profession.value));
      if (!response.ok) throw new Error('Recipe catalog temporarily unavailable.');
      const data = await response.json();
      if (current !== revision || !isCurrent()) return;
      catalog = data.recipes.filter(row => Number.isSafeInteger(row.recipe?.spellId) && row.recipe.name);
      fillRecipes();
    } catch (error) {
      if (current === revision && isCurrent()) recipes.options[0].text = error.message;
    }
  });
  recipeSearch.addEventListener('input', fillRecipes);
  recipes.addEventListener('change', () => { submit.disabled = !recipes.value; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled || !recipes.value) return;
    submit.disabled = true;
    try {
      await guildRequest('/api/crafting-directory', { action:'confirm', character:character.value, profession:profession.value, spellId:Number(recipes.value), note:note.value });
      note.value = '';
      await loadDirectory();
      if (isCurrent()) status.textContent = 'Recipe confirmed.';
    } catch (error) {
      if (isCurrent()) status.textContent = error.message;
    } finally { submit.disabled = !recipes.value; }
  });
}
