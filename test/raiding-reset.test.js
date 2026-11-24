import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openSqlite} from '../src/sqlite.js';

test('Raiding reset clears raid data once and preserves guild characters, events and gear builds',()=>{
  const directory=mkdtempSync(join(tmpdir(),'solstice-reset-'));
  const file=join(directory,'guild.sqlite');
  try {
    const db=new DatabaseSync(file);
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE _solstice_migrations(name TEXT PRIMARY KEY)');
    for(const name of readdirSync(new URL('../migrations/',import.meta.url)).sort().filter(name=>name<'0024')){
      db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
      db.prepare('INSERT INTO _solstice_migrations VALUES(?)').run(name);
    }
    const raid="INSERT INTO raids(id,owner,title,starts_at,size,notes) VALUES('raid','member','Old raid','2026-12-01T00:00:00Z',10,'')";
    db.exec(raid);
    db.exec(`INSERT INTO raid_signups(raid_id,member,character,class_name,role,status) VALUES('raid','member','Astra Mortis','Mage','Ranged DPS','Going');
      INSERT INTO raid_prep(raid_id,id,task) VALUES('raid','task','Prepare');
      INSERT INTO raid_reserves VALUES('raid','member','Astra Mortis','[]');
      INSERT INTO raid_log_links VALUES('raid','report');
      INSERT INTO raid_log_cache VALUES('report','{}',1);
      INSERT INTO raid_loot_awards VALUES('award','raid','Old raid','date','Item','Astra Mortis','','date');
      INSERT INTO raid_loot_tables VALUES('member','instance','[]');
      INSERT INTO raid_characters VALUES('member','Astra Mortis','Mage','Arcane','Ranged DPS');
      INSERT INTO guild_events(id,owner,title,type,starts_at) VALUES('event','member','Fresh 60','Leveling','2026-12-01T00:00:00Z');
      INSERT INTO guild_event_signups VALUES('event','member');
      INSERT INTO gear_builds(id,member,character,title) VALUES('build','member','Astra Mortis','Upgrades');`);
    db.close();
    let migrated=openSqlite(file);
    for(const table of ['raids','raid_signups','raid_prep','raid_reserves','raid_log_links','raid_log_cache','raid_loot_awards','raid_loot_tables'])assert.equal(migrated.prepare('SELECT COUNT(*) AS n FROM '+table).bind().first().n,0,table);
    for(const table of ['raid_characters','guild_events','guild_event_signups','gear_builds'])assert.equal(migrated.prepare('SELECT COUNT(*) AS n FROM '+table).bind().first().n,1,table);
    migrated.close();
    const after=new DatabaseSync(file);after.exec(raid);after.close();
    migrated=openSqlite(file);
    assert.equal(migrated.prepare('SELECT COUNT(*) AS n FROM raids').bind().first().n,1,'reset is never repeated on restart');
    migrated.close();
  }finally{rmSync(directory,{recursive:true,force:true});}
});
