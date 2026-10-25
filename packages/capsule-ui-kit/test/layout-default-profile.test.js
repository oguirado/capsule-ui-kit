import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultLayoutProfile, createLayoutProfileController } from '../src/workspace/layoutProfile.js';
test('custom safe default is scoped, validates before mount, and replaces corrupt/future layouts without overwriting', async () => {
  const scope={product:'consumer',profileId:'alice-profile',workspaceId:'cockpit'};
  const profile=structuredClone(createDefaultLayoutProfile(scope));
  profile.dockview.panels['panel-capsule-primary'].title='Cockpit primary';
  for (const raw of ['{broken', JSON.stringify({...profile,schemaVersion:999})]) {
    let writes=0;
    const storage={readRaw:async()=>raw,writeAtomic:async()=>{writes++}};
    const controller=createLayoutProfileController({scope,ownerWindowId:'main-window',storage,defaultProfile:profile});
    const restored=await controller.restore();
    assert.equal(restored.status,'quarantined-safe-fallback');
    assert.equal(restored.inMemorySafeProfile.dockview.panels['panel-capsule-primary'].title,'Cockpit primary');
    assert.equal((await controller.saveOnGesture(profile)).ok,false);
    assert.equal(writes,0);
    assert.equal(await storage.readRaw(),raw);
  }
  assert.throws(()=>createLayoutProfileController({scope:{...scope,profileId:'other-profile'},ownerWindowId:'main-window',storage:{readRaw:async()=>null,writeAtomic:async()=>{}},defaultProfile:profile}),/Invalid default/);
});
