const assert = require('node:assert/strict');
const {initial, resolve} = require('../public/chase_rules.js');
const {validate} = require('../public/project_storage.js');
let game = initial();
for(let i=0;i<5;i++) game=resolve(game,false);
assert.equal(game.status,'won'); assert.equal(game.score,50); assert.equal(game.lives,3);
assert.deepEqual(resolve(game,true),game);
game=initial(); for(let i=0;i<3;i++) game=resolve(game,true);
assert.equal(game.status,'lost'); assert.equal(game.lives,0);
game=resolve(resolve(initial(),true),false); assert.equal(game.lives,2); assert.equal(game.score,10);
const project={format:'minisql-project',version:1,sql:'SELECT id FROM users;',history:[],tables:[
{id:'t_users',name:'users',x:50,y:50,columns:[{id:'c-1',name:'id',type:'int',isPk:true}]},
{id:'t_orders',name:'orders',x:500,y:50,columns:[{id:'c-2',name:'user_id',type:'int',isPk:false,fkTo:'t_users',fkColumn:'c-1'}]}
]};
assert.deepEqual(validate(JSON.parse(JSON.stringify(project))), project);
for(const corrupt of [p=>p.version=2,p=>p.tables[1].columns[0].type='text',p=>p.tables[1].columns[0].fkColumn='missing',p=>p.tables[0].name='<img src=x>',p=>p.tables[0].x=Infinity,p=>p.tables[0].columns[0].isPk=false,p=>p.tables[1].columns[0].id='c-1']){
 const p=structuredClone(project);corrupt(p);assert.throws(()=>validate(p));
}
console.log('Game win/loss/scoring and project validation/round-trip checks passed.');
