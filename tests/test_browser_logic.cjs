const assert = require('node:assert/strict');
const {initial, resolve, wave, phase, TARGET, SHIELD_SECONDS, SHIELD_COOLDOWN} = require('../public/chase_rules.js');
const {validate} = require('../public/project_storage.js');
const presets = require('../public/review_queries.js');
let game = initial();
for(let i=0;i<5;i++) game=resolve(game,false);
assert.equal(game.status,'playing', 'Five easy dodges must no longer win');
assert.equal(game.lives,3);
assert.ok(game.score < TARGET);
let rounds=5;
while(game.status==='playing' && rounds<100){game=resolve(game,'dodge');rounds++;}
assert.equal(game.status,'won'); assert.ok(rounds>=15 && rounds<30); assert.equal(game.lives,3);
assert.deepEqual(resolve(game,true),game);
game=initial(); for(let i=0;i<3;i++) game=resolve(game,true);
assert.equal(game.status,'lost'); assert.equal(game.lives,0);
game=resolve(resolve(initial(),true),false); assert.equal(game.lives,2); assert.equal(game.score,10);
let streak=initial();for(let i=0;i<8;i++) streak=resolve(streak,'dodge');
assert.ok(streak.score > 80, 'Combos must reward sustained dodges');
const blocked=resolve(streak,'blocked'); assert.equal(blocked.lives,3);assert.equal(blocked.streak,0);assert.equal(blocked.score,streak.score);
assert.equal(resolve(initial(),'dodge',true).score,15);
assert.equal(resolve(streak,'hit').streak,0);
assert.deepEqual([phase(0),phase(100),phase(250)],[1,2,3]);
assert.ok(SHIELD_SECONDS < 1 && SHIELD_COOLDOWN >= 5);
// Fairness: every pattern has a real safe lane, never all three lanes blocked.
// Camping: the guaranteed safe lane changes every wave, across every phase.
for(const score of [0,100,250]) for(let seed=0;seed<50;seed++){
 let safe=-1;
 for(let round=1;round<=30;round++){
  const attack=wave(score,round%3,round,safe,()=>((seed*17+round*7)%100)/100);
  assert.ok(attack.safe>=0 && attack.safe<3);assert.notEqual(attack.safe,safe);
  assert.ok(attack.lanes.length>=1 && attack.lanes.length<=2);
  assert.equal(new Set(attack.lanes).size,attack.lanes.length);
  assert.ok(!attack.lanes.includes(attack.safe));
  assert.ok(attack.warning>=.35 && attack.travel>=.8);
  if(score>=100)assert.equal(attack.lanes.length,2);
  safe=attack.safe;
 }
}
assert.ok(wave(250,1,1).travel < wave(0,1,1).travel);
// An optimal player can clear the full encounter without getting hit.
game=initial(); let safe=-1,round=0;
while(game.status==='playing' && round<100){const attack=wave(game.score,1,++round,safe,()=>.3);safe=attack.safe;game=resolve(game,attack.lanes.includes(safe));}
assert.equal(game.status,'won');assert.equal(game.lives,3);
assert.ok(presets.length>=8);assert.equal(new Set(presets.map(p=>p.sql)).size,presets.length);
assert.ok(presets.some(p=>p.kind==='egg' && p.sql==='RUN FROM CLASS;'));
assert.ok(presets.some(p=>p.kind==='query' && p.sql.includes('HAVING')));
assert.ok(presets.every(p=>p.title && p.note && p.sql));
const project={format:'minisql-project',version:1,sql:'SELECT id FROM users;',history:[],tables:[
{id:'t_users',name:'users',x:50,y:50,columns:[{id:'c-1',name:'id',type:'int',isPk:true}]},
{id:'t_orders',name:'orders',x:500,y:50,columns:[{id:'c-2',name:'user_id',type:'int',isPk:false,fkTo:'t_users',fkColumn:'c-1'}]}
]};
assert.deepEqual(validate(JSON.parse(JSON.stringify(project))), project);
for(const corrupt of [p=>p.version=2,p=>p.tables[1].columns[0].type='text',p=>p.tables[1].columns[0].fkColumn='missing',p=>p.tables[0].name='<img src=x>',p=>p.tables[0].x=Infinity,p=>p.tables[0].columns[0].isPk=false,p=>p.tables[1].columns[0].id='c-1',p=>delete p.tables[0].name,p=>delete p.tables[1].columns[0].fkTo]){
 const p=structuredClone(project);corrupt(p);assert.throws(()=>validate(p));
}
console.log('Boss phases, fair patterns, shield/combo scoring, review presets and project validation checks passed.');
