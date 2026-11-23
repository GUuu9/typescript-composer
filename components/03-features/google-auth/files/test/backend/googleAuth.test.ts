import assert from 'node:assert/strict';
import test from 'node:test';
import { GoogleAuthUsecase } from '../../src/backend/usecases/googleAuth/googleAuth.usecase.ts';

test('Google callback consumes a verified attempt before account signup', async () => {
  const session = { userId: 'test', token: 'session', expiresAt: Date.now() + 60_000 };
  const google = new GoogleAuthUsecase({
    authorizationUrl: state => `https://accounts.google.com/?state=${state}`,
    exchange: async () => 'verifiedIdentity',
  }, {
    signIn: () => null,
    signUp: (identity, input) => {
      assert.equal(identity, 'verifiedIdentity');
      assert.deepEqual(input, { nickname: 'test' });
      return session;
    },
  });
  const origin = 'https://app.example';
  const attempt = google.begin(origin, undefined);
  const state = new URL(attempt.url).searchParams.get('state')!;
  await assert.rejects(google.callback(attempt.key, 'wrong', 'code'));
  const pending = await google.callback(attempt.key, state, 'code');
  await assert.rejects(google.callback(attempt.key, state, 'code'));
  assert.equal(pending.origin, origin);
  assert.equal(google.status(pending.key ?? undefined).needsNickname, true);
  assert.deepEqual(google.complete(pending.key ?? undefined, { nickname: 'test' }), session);
  assert.throws(() => google.complete(pending.key ?? undefined, { nickname: 'test' }));
  google.dispose();
});
