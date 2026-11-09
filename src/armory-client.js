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
      title.append(raidElement('strong',entry.name),raidElement('small',entry.class_name+' · '+entry.role));
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
        results.append(renderArmoryProfile(character));
        const roleLabel = raidElement('label','Raid role ');
        const role = raidElement('select');
        for (const value of raidRoles) role.add(new Option(value,value));
        roleLabel.append(role);
        const link = raidElement('button','Link to Discord','raid-primary');
        link.addEventListener('click',async()=>{
          link.disabled = true;
          try {
            await armoryRequest('',{action:'link',slug:character.slug,role:role.value});
            if (card.isConnected) await openRaidView('characters',null,false);
          } catch (error) { raidError(error); }
          finally { link.disabled = false; }
        });
        const actions = raidElement('div',null,'raid-actions');
        actions.append(roleLabel,link); results.append(actions);
      } catch (error) { results.append(raidElement('p',error.message)); }
      finally { search.disabled = false; }
    });
  } catch (error) { content.append(raidElement('p',error.message)); }
}
