import test from 'node:test';
import assert from 'node:assert/strict';
import {STATES,validateStatus,statusAge} from '../src/state.js';
import {readFileSync} from 'node:fs';

test('all five public states are valid and supply safe labels',()=>{
  for(const state of Object.keys(STATES)) { const value=validateStatus({state,updatedAt:'2026-09-30T08:15:00Z',activity:'PRIVATE DATA',secret:'PRIVATE'});assert.equal(value.state,state);assert.equal(value.activity,STATES[state].activity);assert.equal('secret' in value,false);assert.equal(Object.isFrozen(value),true); }
});
test('unrecognized or prototype states are rejected',()=>{for(const state of ['__proto__','constructor','unknown',null])assert.throws(()=>validateStatus({state,updatedAt:'2026-09-30T08:15:00Z'}));});
test('invalid and missing dates are rejected',()=>{for(const updatedAt of [null,'','today','invalid','2026-09-30'])assert.throws(()=>validateStatus({state:'building',updatedAt}));});
test('old snapshots are explicit',()=>{assert.equal(statusAge('2026-09-28T00:00:00Z',Date.parse('2026-09-30T00:00:00Z')),'Older snapshot');assert.equal(statusAge('2026-09-30T00:00:00Z',Date.parse('2026-09-30T12:00:00Z')),'Published snapshot');});
test('published status validates',()=>{validateStatus(JSON.parse(readFileSync(new URL('../public/status.json',import.meta.url))));});
