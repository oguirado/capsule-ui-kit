import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicProjectionCoordinator } from '../src/state/publicProjection.js';
test('typed money preserves currency and minor units; malformed/extra fields refuse atomically', () => {
  const c=createPublicProjectionCoordinator();
  const session=c.beginSession({query:'owner',epoch:1});
  c.markSubscriptionReady(session.generation);
  const envelope={schema:'capsule-ui-kit.public-projection/v1',query:'owner',epoch:1,revision:1,projection:{cash:{currency:1,minor:5000000}}};
  assert.equal(c.admit(envelope).ok,true);
  assert.deepEqual(c.getView().getProjection().cash,{currency:1,minor:5000000});
  for(const cash of [{currency:1,minor:1.5},{currency:1,minor:Number.MAX_SAFE_INTEGER+1},{currency:1},{currency:1,minor:7,permission:true}]) {
    assert.equal(c.admit({...envelope,revision:2,projection:{cash}}).ok,false);
    assert.deepEqual(c.getView().getProjection().cash,{currency:1,minor:5000000});
  }
});
