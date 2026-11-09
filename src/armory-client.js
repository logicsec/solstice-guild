export function renderArmoryProfile(character) {
  const root = raidElement('div',null,'armory-profile');
  root.append(raidElement('h3',character.name),raidElement('p',[
    character.level && 'Level '+character.level,character.race,character.className,character.faction,character.guild,
  ].filter(Boolean).join(' · ')));
  if (character.render) {
    const image = raidElement('img');
    image.src = character.render;
    image.alt = 'Blizzard Armory render of '+character.name;
    image.loading = 'lazy';
    root.append(image);
  }
  const gear = raidElement('details');
  gear.append(raidElement('summary','Gear & enchants'+(character.itemLevel ? ' · item level '+character.itemLevel : '')));
  for (const item of character.gear ?? []) {
    const row = raidElement('div',null,'armory-item');
    const name = raidElement('strong',item.name);
    name.dataset.quality = item.quality;
    row.append(raidElement('small',item.slot),name,raidElement('small',item.enchants.join(' · ') || 'No enchant reported'));
    gear.append(row);
  }
  if (!character.gear?.length) gear.append(raidElement('p','No equipment data available.'));
  const professions = raidElement('details');
  professions.append(raidElement('summary','Professions'));
  for (const entry of character.professions ?? []) {
    const skills = entry.skill == null ? entry.tiers.filter(tier=>tier.skill != null)
      .map(tier=>[tier.name,tier.skill+(tier.maxSkill ? ' / '+tier.maxSkill : '')].filter(Boolean).join(' ')).join(' · ') :
      entry.skill+(entry.maxSkill ? ' / '+entry.maxSkill : '');
    professions.append(raidElement('p',[entry.name,skills].filter(Boolean).join(' · ')));
  }
  if (!character.professions?.length) professions.append(raidElement('p','No profession data available.'));
  root.append(gear,professions,raidElement('small','Source: Blizzard Armory'));
  return root;
}

export async function renderArmory(root) {
  const card = raidElement('section',null,'raid-card armory-card');
  card.append(raidElement('p','Blizzard Armory','eyebrow'),raidElement('h3','Link a character'),
    raidElement('p','Enter your character’s first and last name. A link associates this character with your Discord account for raid sign-ups.'));
  const content = raidElement('div');
  card.append(content); root.append(card);
  try {
    const {configured,characters} = await armoryRequest();
    for (const entry of characters) {
      const row = raidElement('div',null,'raid-row');
      const title = raidElement('div');
      title.append(raidElement('strong',entry.name),raidElement('small',[entry.class_name,entry.spec,entry.role].filter(Boolean).join(' · ')));
      const unlink = raidElement('button','Unlink');
      unlink.addEventListener('click',async()=>{
        unlink.disabled = true;
        try {
          await armoryRequest('',{action:'unlink',slug:entry.slug});
          row.remove();
        } catch (error) { raidError(error); }
        finally { unlink.disabled = false; }
      });
      row.append(title,unlink); content.append(row);
    }
    if (!configured) { content.append(raidElement('p','Armory lookup requires Blizzard API credentials from your guild administrator.')); return; }
    const form = raidElement('form',null,'raid-form armory-search');
    function nameField(title, example) {
      const label = raidElement('label',title);
      const field = raidElement('input');
      field.placeholder = example;
      field.required = true;
      field.maxLength = 30;
      field.autocomplete = 'off';
      label.append(field);
      form.append(label);
      return field;
    }
    const firstName = nameField('First name','Astra');
    const lastName = nameField('Last name','Mortis');
    const search = raidElement('button','Search Armory','raid-primary');
    const results = raidElement('div');
    results.setAttribute('aria-live','polite');
    form.append(search); content.append(form,results);
    form.addEventListener('submit',async event=>{
      event.preventDefault(); search.disabled = true; results.replaceChildren();
      try {
        const name = firstName.value.trim()+' '+lastName.value.trim();
        const {character} = await armoryRequest('?name='+encodeURIComponent(name));
        if (card.isConnected) renderArmoryConfirmation(card,character,search);
      } catch (error) { results.append(raidElement('p',error.message)); }
      finally { search.disabled = false; }
    });
  } catch (error) { content.append(raidElement('p',error.message)); }
}

export function renderArmoryConfirmation(card,character,search) {
  const dialog = raidElement('dialog',null,'armory-confirm');
  dialog.setAttribute('aria-labelledby','armory-confirm-title');
  const header = raidElement('header',null,'armory-confirm-header');
  const heading = raidElement('div');
  const title = raidElement('h2','Character found');
  title.id = 'armory-confirm-title';
  heading.append(title,raidElement('p','Confirm the details to add this character.'));
  const close = raidElement('button','×','armory-confirm-close');
  close.type = 'button';
  close.setAttribute('aria-label','Close character confirmation');
  close.addEventListener('click',()=>dialog.close());
  header.append(heading,close);

  const summary = raidElement('div',null,'armory-confirm-summary');
  const portrait = raidElement('div',null,'armory-confirm-portrait');
  const initials = character.name.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase();
  portrait.textContent = initials;
  function icon(name) {
    const image = raidElement('img');
    image.alt = '';
    image.src = 'https://wow.zamimg.com/images/wow/icons/medium/'+name+'.jpg';
    return image;
  }
  if (Object.hasOwn(armorySpecs,character.className)) {
    const image = icon('classicon_'+character.className.toLowerCase());
    image.addEventListener('load',()=>portrait.replaceChildren(image));
  }
  const identity = raidElement('div');
  identity.append(raidElement('h3',character.name),raidElement('p',[
    character.ruleset,character.level != null && 'Level '+character.level,
  ].filter(Boolean).join(' · ')));
  const badges = raidElement('div',null,'armory-confirm-badges');
  if (character.className) {
    const classBadge = raidElement('span',character.className,'armory-class-badge');
    classBadge.dataset.wowClass = character.className;
    badges.append(classBadge);
  }
  if (character.faction) badges.append(raidElement('span',character.faction));
  identity.append(badges);
  if (character.guild) identity.append(raidElement('p','‹'+character.guild+'›','armory-confirm-guild'));
  summary.append(portrait,identity);

  const form = raidElement('form',null,'armory-confirm-form');
  const specs = Object.hasOwn(armorySpecs,character.className) ? armorySpecs[character.className] : [];
  if (specs.length) {
    const fieldset = raidElement('fieldset',null,'armory-specs');
    const choices = raidElement('div',null,'armory-spec-grid');
    fieldset.append(raidElement('legend','Primary specialization'),choices);
    for (const [index,[name,defaultRole,iconName]] of specs.entries()) {
      const label = raidElement('label',null,'armory-spec');
      const input = raidElement('input');
      Object.assign(input,{type:'radio',name:'spec',value:name,checked:index===0});
      const text = raidElement('span');
      text.append(raidElement('strong',name),raidElement('small',defaultRole));
      const specIcon = icon(iconName);
      specIcon.addEventListener('error',()=>specIcon.hidden = true);
      label.append(input,specIcon,text);
      choices.append(label);
    }
    form.append(fieldset);
  }
  const feedback = raidElement('p',null,'armory-confirm-feedback');
  feedback.setAttribute('role','status');
  const actions = raidElement('div',null,'armory-confirm-actions');
  const add = raidElement('button','Add character','raid-primary');
  const back = raidElement('button','Back');
  back.type = 'button';
  back.addEventListener('click',()=>dialog.close());
  actions.append(add,back);
  form.append(feedback,actions);
  if (!specs.length) {
    add.disabled = true;
    feedback.textContent = 'No specialization choices are available for this class.';
  }
  dialog.append(header,summary,form);
  dialog.addEventListener('close',()=>{
    dialog.remove();
    if (search.isConnected) search.focus();
  });
  dialog.addEventListener('cancel',event=>{ if (back.disabled) event.preventDefault(); });
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    add.disabled = back.disabled = close.disabled = true;
    feedback.textContent = '';
    try {
      await armoryRequest('',{action:'link',slug:character.slug,spec:new FormData(form).get('spec') ?? ''});
      dialog.close();
      if (card.isConnected) await openRaidView('characters',null,false);
    } catch (error) { feedback.textContent = error.message; }
    finally { add.disabled = back.disabled = close.disabled = false; }
  });
  card.append(dialog);
  dialog.showModal();
}
